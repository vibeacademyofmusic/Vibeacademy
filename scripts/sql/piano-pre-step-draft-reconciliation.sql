-- Local authoring reconciliation only; run inside a transaction.
set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_advisory_xact_lock(hashtextextended('vibe:piano-pre-step-book-b',0));
lock table curriculums,curriculum_levels,curriculum_subjects,curriculum_subject_components,curriculum_component_items in share row exclusive mode;
lock table student_curriculum_enrollments,student_level_progress,student_subject_progress,student_component_progress,student_component_item_progress in share mode;
do $reconcile$
declare sid uuid; cid uuid; lid uuid; n int; t text; digest text; before_progress jsonb:='{}'; after_progress jsonb:='{}'; changed_subject int; changed_component int;
begin
 select s.id,l.id into strict sid,lid from curriculums p join curriculum_levels l on l.curriculum_id=p.id join curriculum_subjects s on s.level_id=l.id where p.code='PIANO' and l.code='PRE_STEP' and s.code='TECHNIQUE_FOUNDATION';
 if not exists(select 1 from curriculum_subjects where id=sid and not is_required and completion_rule='ALL_REQUIRED_COMPONENTS') then raise exception 'TECHNIQUE_RULE_OR_REQUIREMENT_CONFLICT'; end if;
 select id into strict cid from curriculum_subject_components where subject_id=sid and code='LESSON_DRAFTS';
 if (select count(*) from curriculum_subject_components where subject_id=sid)<>1 or not exists(select 1 from curriculum_subject_components where id=cid and not is_required and completion_rule='DIRECT_ASSESSMENT') then raise exception 'TECHNIQUE_COMPONENT_CONFLICT'; end if;
 select count(*) into n from curriculum_component_items where component_id=cid;
 if n<>10 or exists(select 1 from curriculum_component_items where component_id=cid and (status<>'INACTIVE' or is_required or code<>'L'||lpad(sort_order::text,2,'0') or sort_order not between 1 and 10 or name<>'Lesson '||lpad(sort_order::text,2,'0'))) then raise exception 'TECHNIQUE_HAS_AUTHORED_OR_ACTIVE_CONTENT'; end if;
 if exists(select 1 from student_subject_progress where subject_id=sid) or exists(select 1 from student_component_progress where component_id=cid) or exists(select 1 from student_component_item_progress where item_id in(select id from curriculum_component_items where component_id=cid)) then raise exception 'TECHNIQUE_HAS_STUDENT_HISTORY'; end if;
 if exists(select 1 from academic_video_links where item_id in(select id from curriculum_component_items where component_id=cid)) or exists(select 1 from curriculum_lesson_syllabi where item_id in(select id from curriculum_component_items where component_id=cid)) or exists(select 1 from curriculum_lesson_guides where item_id in(select id from curriculum_component_items where component_id=cid)) then raise exception 'TECHNIQUE_HAS_AUTHORED_GUIDE'; end if;
 if (select count(*) from curriculum_lesson_syllabi g join curriculum_component_items i on i.id=g.item_id join curriculum_subject_components c on c.id=i.component_id join curriculum_subjects s on s.id=c.subject_id where s.level_id=lid and s.code='METHODE_BOOK' and s.status='ACTIVE' and c.status='ACTIVE' and i.status='ACTIVE')<>50 then raise exception 'BOOK_B_CONTENT_NOT_READY'; end if;
 foreach t in array array['student_curriculum_enrollments','student_level_progress','student_subject_progress','student_component_progress','student_component_item_progress'] loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,''[]'')) from %I t',t) into digest;
  before_progress:=before_progress||jsonb_build_object(t,digest);
 end loop;
 update curriculum_subject_components set status='INACTIVE' where id=cid and status='ACTIVE';
 get diagnostics changed_component=row_count;
 update curriculum_subjects set status='INACTIVE' where id=sid and status='ACTIVE';
 get diagnostics changed_subject=row_count;
 foreach t in array array['student_curriculum_enrollments','student_level_progress','student_subject_progress','student_component_progress','student_component_item_progress'] loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,''[]'')) from %I t',t) into digest;
  after_progress:=after_progress||jsonb_build_object(t,digest);
 end loop;
 if after_progress<>before_progress then raise exception 'PROGRESS_CHANGED'; end if;
 raise notice 'Reconciled draft-only Technique: subject %, component %, progress unchanged',changed_subject,changed_component;
end $reconcile$;
select jsonb_build_object('progress_unchanged',true,'subjects',(select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'status',s.status,'completion_rule',s.completion_rule,'is_required',s.is_required) order by s.sort_order) from curriculum_subjects s join curriculum_levels l on l.id=s.level_id join curriculums p on p.id=l.curriculum_id where p.code='PIANO' and l.code='PRE_STEP'));
