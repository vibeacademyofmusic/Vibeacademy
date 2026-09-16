-- Compute review urgency with the same database clock as submission timestamps.
create view public.learning_manual_review_queue with(security_invoker=true) as
 select id,student_id,assessment_id,question_snapshot,answers,evidence,submitted_at,
 review_due_at,review_due_at<now() as overdue
 from public.learning_assessment_attempts
 where state='PENDING_REVIEW' and public.has_role('SUPER_ADMIN');
revoke all on public.learning_manual_review_queue from public,anon,authenticated,service_role;
grant select on public.learning_manual_review_queue to authenticated;
