-- Recheck source and audience immediately before processing/confirming delivery.
-- A queued notice does not preserve permission after a relationship is revoked.
create function notification_private.guard_delivery() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status in('PROCESSING','SENT') and new.status is distinct from old.status then
  if not notification_private.recipient_allowed(new.recipient_id,new.student_id,new.branch_id,new.template_key) then raise exception 'Notification recipient no longer eligible';end if;
  if new.template_key='TUITION_REMINDER' and not exists(
   select 1 from tuition_reminders r join enrollment_tuition t on t.id=r.enrollment_tuition_id join enrollments e on e.id=t.enrollment_id
   where r.id=new.entity_id and r.status='PENDING' and t.status in('ACTIVE','SCHEDULED') and e.status='ACTIVE'
   and t.effective_ends_on>=(now() at time zone 'Asia/Ho_Chi_Minh')::date
  ) then raise exception 'Notification source no longer eligible';end if;
 end if;return new;
end $$;
revoke all on function notification_private.guard_delivery() from public,anon,authenticated,service_role;
create trigger notification_delivery_revalidation before update on public.notification_jobs for each row execute function notification_private.guard_delivery();
