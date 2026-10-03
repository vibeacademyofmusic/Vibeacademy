-- ============================================================
-- VIBE: Thống nhất "Lương cố định" với "Lương tháng".
--
-- Mã chính thức: BASE_SALARY
-- Ngừng sử dụng: FIXED_PAY
--
-- Không xóa danh mục.
-- Không chuyển đổi cấu hình hoặc sửa bảng lương lịch sử.
-- Nếu FIXED_PAY đã có dữ liệu sử dụng thì dừng để đối soát.
-- ============================================================

do $migration$
begin
  -- Không chờ khóa database quá lâu.
  perform pg_catalog.set_config('lock_timeout', '5s', true);

  -- Giữ dữ liệu ổn định trong lúc kiểm tra và thêm ràng buộc.
  lock table public.staff_compensation_components
    in access exclusive mode;

  lock table public.payroll_component_lines_v2
    in share mode;

  -- Khóa hai dòng danh mục liên quan.
  perform 1
  from public.payroll_component_catalog
  where code in ('BASE_SALARY', 'FIXED_PAY')
  order by code
  for update;

  -- Phải có mã lương tháng chính thức đang hoạt động.
  if not exists (
    select 1
    from public.payroll_component_catalog
    where code = 'BASE_SALARY'
      and category = 'EARNING'
      and status = 'ACTIVE'
      and recurring_configurable = true
  ) then
    raise exception
      'BASE_SALARY chưa sẵn sàng. Dừng để kiểm tra danh mục.';
  end if;

  if not exists (
    select 1
    from public.payroll_component_catalog
    where code = 'FIXED_PAY'
      and category = 'EARNING'
  ) then
    raise exception
      'Không tìm thấy FIXED_PAY đúng loại EARNING. Dừng để kiểm tra.';
  end if;

  -- Kiểm tra lại ngay lúc áp dụng, không chỉ dựa vào kết quả cũ.
  if exists (
    select 1
    from public.staff_compensation_components
    where component_code = 'FIXED_PAY'
  ) or exists (
    select 1
    from public.payroll_component_lines_v2
    where component_code = 'FIXED_PAY'
  ) then
    raise exception
      'FIXED_PAY đã có dữ liệu sử dụng. Không tự sửa; cần đối soát.';
  end if;

  -- Chặn cấu hình mới bằng mã đã ngừng sử dụng.
  alter table public.staff_compensation_components
    add constraint staff_compensation_components_no_fixed_pay
    check (component_code <> 'FIXED_PAY');

  -- Giữ mã trong danh mục nhưng ngừng cho cấu hình.
  update public.payroll_component_catalog
  set
    status = 'INACTIVE',
    recurring_configurable = false,
    description =
      'Ngừng sử dụng. Lương cố định và lương tháng là cùng một khoản tại VIBE; sử dụng BASE_SALARY.'
  where code = 'FIXED_PAY';

end;
$migration$;