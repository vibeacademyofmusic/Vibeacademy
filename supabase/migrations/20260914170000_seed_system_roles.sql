-- Stable system role identities, required on both fresh and existing databases.
-- Preserve existing IDs/names/descriptions and all roles outside this code list.
-- This seeds the role catalog only; it does not create users or grant user roles.
insert into public.roles (code, name, is_system)
values
  ('SUPER_ADMIN', 'Quản trị viên cấp cao', true),
  ('BRANCH_MANAGER', 'Quản lý chi nhánh', true),
  ('ACADEMIC_MANAGER', 'Quản lý đào tạo', true),
  ('TEACHER', 'Giáo viên', true),
  ('STUDENT', 'Học viên', true),
  ('PARENT', 'Phụ huynh', true),
  ('ACCOUNTANT', 'Kế toán', true),
  ('STAFF', 'Nhân viên', true)
on conflict (code) do update
set is_system = true
where public.roles.is_system is distinct from true;
