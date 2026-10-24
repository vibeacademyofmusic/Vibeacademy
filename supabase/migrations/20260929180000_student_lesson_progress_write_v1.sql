-- Super admin records Đang học / Đạt on a lesson.
-- The existing item trigger rolls the component and subject status.

begin;

grant insert, update
on public.student_component_item_progress
to authenticated;

drop policy if exists student_component_item_progress_super_admin_insert
on public.student_component_item_progress;

create policy student_component_item_progress_super_admin_insert
on public.student_component_item_progress
for insert
to authenticated
with check (public.has_role('SUPER_ADMIN'));

drop policy if exists student_component_item_progress_super_admin_update
on public.student_component_item_progress;

create policy student_component_item_progress_super_admin_update
on public.student_component_item_progress
for update
to authenticated
using (public.has_role('SUPER_ADMIN'))
with check (public.has_role('SUPER_ADMIN'));

commit;
