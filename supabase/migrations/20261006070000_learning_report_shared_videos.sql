-- Official approved learning reports freeze the shared lesson videos that exist
-- on the academic record at generation time. Internal videos stay off the print.
-- The family portal snapshot is unchanged until the portal merge.

CREATE OR REPLACE FUNCTION public.learning_report_source(p_enrollment_id uuid, p_start date, p_end date) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
with context as (
  select e.*, s.full_name,s.student_code,c.branch_id,c.name class_name,b.name branch_name
  from enrollments e join students s on s.id=e.student_id join classes c on c.id=e.class_id join branches b on b.id=c.branch_id
  where e.id=p_enrollment_id
), sessions as (
  select o.id,o.occurrence_type,a.id attendance_id,a.status attendance_status
  from context e join schedules sc on sc.class_id=e.class_id join session_occurrences o on o.schedule_id=sc.id
  left join attendance_records a on a.session_occurrence_id=o.id and a.enrollment_id=e.id
  where o.status = 'COMPLETED'
    and o.starts_at >= (p_start::timestamp at time zone 'Asia/Ho_Chi_Minh')
    and o.starts_at < ((p_end+1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
    and (a.id is not null or
      (o.occurrence_type='MAKEUP' and exists(select 1 from session_occurrence_participants sp where sp.session_occurrence_id=o.id and sp.enrollment_id=e.id)) or
      (o.occurrence_type='REGULAR' and e.started_at <= o.occurrence_date and (e.ended_at is null or e.ended_at>=o.occurrence_date)
        and not exists(select 1 from enrollment_pauses ep where ep.enrollment_id=e.id and ep.status='ACTIVE' and o.occurrence_date between ep.starts_on and ep.ends_on)))
), journal_rows as (
  select j.content,j.repertoire,j.skills,j.homework,j.observation,j.updated_at
  from sessions s join learning_journals j on j.attendance_record_id=s.attendance_id
  where not exists(select 1 from student_learning_journal_entries e where e.attendance_record_id=s.attendance_id)
  union all
  select e.progress_note as content, '' as repertoire, '' as skills, e.individual_homework as homework,
    e.observation, e.updated_at
  from sessions s join student_learning_journal_entries e on e.attendance_record_id=s.attendance_id
  join session_learning_journals j on j.id=e.session_journal_id where j.status='SUBMITTED'
), subjects as (
  select l.name grade,lp.status grade_status,cs.name,cs.is_required,cs.completion_rule,
    coalesce(sp.status,'NOT_STARTED') status,sp.score,
    coalesce((select jsonb_agg(jsonb_build_object('name',cc.name,'required',cc.is_required,'status',coalesce(cp.status,'NOT_STARTED'),'score',cp.score) order by cc.sort_order,cc.id)
      from curriculum_subject_components cc left join student_component_progress cp on cp.component_id=cc.id and cp.subject_progress_id=sp.id
      where cc.subject_id=cs.id and cc.status='ACTIVE' and cs.completion_rule='ALL_REQUIRED_COMPONENTS'),'[]'::jsonb) components
  from context e join student_level_progress lp on lp.enrollment_id=e.student_curriculum_enrollment_id
  join curriculum_levels l on l.id=lp.level_id
  join curriculum_subjects cs on cs.level_id=l.id and cs.status='ACTIVE'
  left join student_subject_progress sp on sp.subject_id=cs.id and sp.level_progress_id=lp.id
)
select jsonb_build_object(
 'schema_version',1,'as_of',now(),'period_start',p_start,'period_end',p_end,
 'student',jsonb_build_object('id',e.student_id,'name',e.full_name,'code',e.student_code),
 'branch',jsonb_build_object('id',e.branch_id,'name',e.branch_name),'class_name',e.class_name,
 'teachers',coalesce((select jsonb_agg(jsonb_build_object('code',t.teacher_code,'name',p.full_name,'role',ct.teacher_role) order by t.teacher_code)
   from class_teachers ct join teachers t on t.id=ct.teacher_id left join profiles p on p.id=t.user_id
   where ct.class_id=e.class_id and ct.assigned_at<=p_end and (ct.ended_at is null or ct.ended_at>=p_start)),'[]'::jsonb),
 'academic',jsonb_build_object('curriculum',cu.name,'current_grade',cl.name,'status',ce.status,
   'subjects',coalesce((select jsonb_agg(to_jsonb(s) order by s.grade,s.name) from subjects s),'[]'::jsonb)),
 'attendance',(select jsonb_build_object('scheduled',count(*),'attended',count(*) filter(where attendance_status in ('PRESENT','LATE')),
   'present',count(*) filter(where attendance_status='PRESENT'),'late',count(*) filter(where attendance_status='LATE'),
   'absent',count(*) filter(where attendance_status='ABSENT'),'excused',count(*) filter(where attendance_status='EXCUSED'),
   'unmarked',count(*) filter(where attendance_status is null),'makeup',count(*) filter(where occurrence_type='MAKEUP'),
   'rate',round(100.0 * count(*) filter(where attendance_status in ('PRESENT','LATE')) / nullif(count(*) filter(where attendance_status is not null),0),1)) from sessions),
 'journals',jsonb_build_object('count',(select count(*) from journal_rows),'excerpts',coalesce((select jsonb_agg(to_jsonb(j)) from (select * from journal_rows order by updated_at desc limit 30) j),'[]'::jsonb)),
 'videos',coalesce((select jsonb_agg(jsonb_build_object(
    'title',v.title,'url',v.url,'note',v.note,'level_name',vl.name,
    'lesson_name',nullif(concat_ws(' · ',subj.name,comp.name,item.name),'')
  ) order by v.created_at,v.id)
  from academic_video_links v
  left join curriculum_levels vl on vl.id=v.level_id
  left join curriculum_component_items item on item.id=v.item_id
  left join curriculum_subject_components comp on comp.id=item.component_id
  left join curriculum_subjects subj on subj.id=comp.subject_id
  where v.enrollment_id=e.student_curriculum_enrollment_id and v.deleted_at is null and v.shared_with_family),'[]'::jsonb)
) from context e left join student_curriculum_enrollments ce on ce.id=e.student_curriculum_enrollment_id
left join curriculums cu on cu.id=ce.curriculum_id left join curriculum_levels cl on cl.id=ce.current_level_id;
$$;
