-- Runs inside a transaction with bb_plan(payload jsonb).
set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_advisory_xact_lock(hashtextextended('vibe:piano-pre-step-book-b',0));
lock table curriculums,curriculum_levels,curriculum_subjects,curriculum_subject_components,curriculum_component_items in share row exclusive mode;
lock table student_curriculum_enrollments,student_level_progress,student_subject_progress,student_component_progress,student_component_item_progress in share mode;
create table if not exists public.curriculum_lesson_syllabi (
 item_id uuid primary key references public.curriculum_component_items(id),
 source_book text not null,source_authors text not null,source_sha256 text not null,
 unit_title text not null,source_pdf_pages text not null,source_printed_pages text,
 learning_objectives text not null,classroom_activities text not null,homework text not null,teacher_notes text not null,
 source_context text not null default '',
 constraint lesson_syllabus_pages check(source_pdf_pages ~ '^[0-9]+(-[0-9]+)?$'),
 constraint lesson_syllabus_content check(length(learning_objectives)>0 and length(classroom_activities)>0 and length(homework)>0 and length(teacher_notes)>0)
);
alter table public.curriculum_lesson_syllabi enable row level security;
revoke all on public.curriculum_lesson_syllabi from public,anon,authenticated;
grant select on public.curriculum_lesson_syllabi to authenticated;
grant all on public.curriculum_lesson_syllabi to service_role;
drop policy if exists curriculum_lesson_syllabi_admin_read on public.curriculum_lesson_syllabi;
create policy curriculum_lesson_syllabi_admin_read on public.curriculum_lesson_syllabi for select to authenticated using(public.has_role('SUPER_ADMIN'));
create temp table bb_audit(kind text,id uuid) on commit drop;
do $bb$
declare p jsonb:=(select payload from bb_plan); sid uuid; lid uuid; cid uuid; iid uuid; v jsonb; n int; before_progress jsonb; after_progress jsonb; others_before jsonb; others_after jsonb; old record; t text;
begin
 if jsonb_array_length(p->'lessons')<>50 then raise exception 'BOOK_B_NEEDS_50_LESSONS'; end if;
 select s.id,l.id into sid,lid from curriculums c join curriculum_levels l on l.curriculum_id=c.id join curriculum_subjects s on s.level_id=l.id where c.code='PIANO' and l.code='PRE_STEP' and s.code='METHODE_BOOK';
 if sid is null then raise exception 'PIANO_PRE_STEP_SUBJECT_MISSING'; end if;
 if (select name from curriculum_subjects where id=sid) not in ('Methode Book',p->>'subject_name') then raise exception 'BOOK_B_SUBJECT_CONFLICT'; end if;
 if (select is_required from curriculum_subjects where id=sid) then raise exception 'BOOK_B_SUBJECT_MUST_REMAIN_OPTIONAL'; end if;
 select jsonb_agg(to_jsonb(s) order by id) into others_before from curriculum_subjects s where id<>sid;
 before_progress:='{}';
 foreach t in array array['student_curriculum_enrollments','student_level_progress','student_subject_progress','student_component_progress','student_component_item_progress'] loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,''[]'')) from %I t',t) into old;
  before_progress:=before_progress||jsonb_build_object(t,old.md5);
 end loop;
 update curriculum_subjects set name=p->>'subject_name',completion_rule='MANUAL' where id=sid and (name,completion_rule) is distinct from (p->>'subject_name','MANUAL');
 if found then insert into bb_audit values('subject',sid); end if;
 for v in select distinct on ((value->>'unit')::int) value from jsonb_array_elements(p->'lessons') order by (value->>'unit')::int loop
  select id into cid from curriculum_subject_components where subject_id=sid and code='BB-U'||lpad(v->>'unit',2,'0');
  if cid is null then
   insert into curriculum_subject_components(subject_id,code,name,sort_order,is_required,status,completion_rule) values(sid,'BB-U'||lpad(v->>'unit',2,'0'),'Unit '||(v->>'unit')||' — '||(v->>'unit_title'),(v->>'unit')::int,false,'ACTIVE','DIRECT_ASSESSMENT') returning id into cid;
   insert into bb_audit values('unit',cid);
  end if;
 end loop;
 for v in select value from jsonb_array_elements(p->'lessons') loop
  select id into cid from curriculum_subject_components where subject_id=sid and code='BB-U'||lpad(v->>'unit',2,'0');
  select i.id into iid from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id where c.subject_id=sid and i.code=v->>'code';
  if iid is null and (v->>'number')::int<=10 then
   select i.* into old from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id where c.subject_id=sid and c.code='LESSON_DRAFTS' and i.code='L'||lpad(v->>'number',2,'0');
   if found then
    if old.name<>'Lesson '||lpad(v->>'number',2,'0') or old.status<>'INACTIVE' or exists(select 1 from student_component_item_progress where item_id=old.id) or exists(select 1 from academic_video_links where item_id=old.id) then raise exception 'BOOK_B_EXISTING_LESSON_HAS_CONTENT_OR_HISTORY'; end if;
    iid:=old.id;
    update curriculum_component_items set component_id=cid,code=v->>'code',name=v->>'title',sort_order=(v->>'number')::int,status='ACTIVE',is_required=false where id=iid;
    insert into bb_audit values('reused_lesson',iid);
   end if;
  end if;
  if iid is null then
   insert into curriculum_component_items(component_id,code,name,sort_order,status,is_required) values(cid,v->>'code',v->>'title',(v->>'number')::int,'ACTIVE',false) returning id into iid;
   insert into bb_audit values('new_lesson',iid);
  end if;
  insert into curriculum_lesson_syllabi(item_id,source_book,source_authors,source_sha256,unit_title,source_pdf_pages,source_printed_pages,learning_objectives,classroom_activities,homework,teacher_notes,source_context)
  values(iid,p->>'subject_name',p->>'source_authors',p->>'source_sha256',v->>'unit_title',v->>'source_pdf_pages',v->>'source_printed_pages',v->>'learning_objectives',v->>'classroom_activities',v->>'homework',v->>'teacher_notes',case when (v->>'number')::int=1 then p->>'source_context' else '' end)
  on conflict(item_id) do nothing;
  if found then insert into bb_audit values('syllabus',iid); end if;
  if not exists(select 1 from curriculum_lesson_syllabi s where s.item_id=iid and s.source_sha256=p->>'source_sha256' and s.learning_objectives=v->>'learning_objectives' and s.classroom_activities=v->>'classroom_activities' and s.homework=v->>'homework' and s.teacher_notes=v->>'teacher_notes' and s.source_pdf_pages=v->>'source_pdf_pages') then raise exception 'BOOK_B_EXISTING_SYLLABUS_CONFLICT'; end if;
 end loop;
 select count(*) into n from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id where c.subject_id=sid;
 if n<>50 then raise exception 'BOOK_B_COUNT_CONFLICT: %',n; end if;
 after_progress:='{}';
 foreach t in array array['student_curriculum_enrollments','student_level_progress','student_subject_progress','student_component_progress','student_component_item_progress'] loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,''[]'')) from %I t',t) into old;
  after_progress:=after_progress||jsonb_build_object(t,old.md5);
 end loop;
 if after_progress<>before_progress then raise exception 'BOOK_B_PROGRESS_CHANGED'; end if;
 select jsonb_agg(to_jsonb(s) order by id) into others_after from curriculum_subjects s where id<>sid;
 if others_after<>others_before then raise exception 'BOOK_B_OTHER_SUBJECT_CHANGED'; end if;
end $bb$;
select json_build_object('changes',(select json_agg(a) from bb_audit a),'progress_unchanged',true,'other_subjects_unchanged',true);
