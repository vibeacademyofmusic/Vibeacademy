-- Targeted curriculum replacement; requires existing Book B syllabus schema.
set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_advisory_xact_lock(hashtextextended('vibe:piano-pre-grade-repertoire',0));
lock table curriculums,curriculum_levels,curriculum_subjects,curriculum_subject_components,curriculum_component_items,curriculum_lesson_syllabi in share row exclusive mode;
lock table student_curriculum_enrollments,student_level_progress,student_subject_progress,student_component_progress,student_component_item_progress in share mode;
alter table curriculum_lesson_syllabi add column if not exists content_scope text not null default '';
alter table curriculum_lesson_syllabi add column if not exists syllabus_pdf_page integer check(syllabus_pdf_page between 1 and 999);
create temp table rep_changes(kind text,id uuid) on commit drop;
do $rep$
declare plan jsonb:=(select payload from rep_plan); b jsonb; v jsonb; lid uuid; oldid uuid; sid uuid; cid uuid; iid uuid; k int; t text; digest text; before_progress jsonb:='{}'; after_progress jsonb:='{}'; other_before jsonb; other_after jsonb; old_components jsonb; old_items jsonb;
begin
 select l.id into strict lid from curriculums p join curriculum_levels l on l.curriculum_id=p.id where p.code='PIANO' and l.code='PRE' and l.name='Pre Grade';
 select id into strict oldid from curriculum_subjects where level_id=lid and code='REPERTOIRE';
 if jsonb_array_length(plan->'books')<>2 then raise exception 'REPERTOIRE_NEEDS_TWO_BOOKS'; end if;
 select jsonb_agg(to_jsonb(s) order by id) into other_before from curriculum_subjects s where id<>oldid and not(level_id=lid and code in('REPERTOIRE_2A','REPERTOIRE_2B'));
 select jsonb_agg(to_jsonb(c) order by id) into old_components from curriculum_subject_components c where subject_id=oldid;
 select jsonb_agg(to_jsonb(i) order by i.id) into old_items from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id where c.subject_id=oldid;
 foreach t in array array['student_curriculum_enrollments','student_level_progress','student_subject_progress','student_component_progress','student_component_item_progress'] loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,''[]'')) from %I t',t) into digest;
  before_progress:=before_progress||jsonb_build_object(t,digest);
 end loop;
 for b in select value from jsonb_array_elements(plan->'books') loop
  if b->>'subject_code' not in('REPERTOIRE_2A','REPERTOIRE_2B') or jsonb_array_length(b->'lessons')<>50 then raise exception 'REPERTOIRE_BOOK_PLAN_INVALID'; end if;
  select id into sid from curriculum_subjects where level_id=lid and code=b->>'subject_code';
  if sid is null then
   select coalesce(max(sort_order),0)+1 into k from curriculum_subjects where level_id=lid;
   insert into curriculum_subjects(level_id,code,name,family_code,sort_order,status,is_required,completion_rule) values(lid,b->>'subject_code',b->>'subject_name','REPERTOIRE',k,'ACTIVE',false,'MANUAL') returning id into sid;
   insert into rep_changes values('subject',sid);
  elsif not exists(select 1 from curriculum_subjects where id=sid and name=b->>'subject_name' and family_code='REPERTOIRE' and status='ACTIVE' and not is_required and completion_rule='MANUAL') then raise exception 'REPERTOIRE_EXISTING_SUBJECT_CONFLICT'; end if;
  for v in select distinct on ((value->>'unit')::int) value from jsonb_array_elements(b->'lessons') order by (value->>'unit')::int loop
   select id into cid from curriculum_subject_components where subject_id=sid and code='REP-'||(b->>'book')||'-U'||lpad(v->>'unit',2,'0');
   if cid is null then
    insert into curriculum_subject_components(subject_id,code,name,sort_order,is_required,status,completion_rule) values(sid,'REP-'||(b->>'book')||'-U'||lpad(v->>'unit',2,'0'),case when (v->>'unit')::int=0 then v->>'unit_title' else 'Unit '||(v->>'unit')||' — '||(v->>'unit_title') end,(v->>'unit')::int,false,'ACTIVE','DIRECT_ASSESSMENT') returning id into cid;
    insert into rep_changes values('unit',cid);
   end if;
   if not exists(select 1 from curriculum_subject_components where id=cid and status='ACTIVE' and not is_required and completion_rule='DIRECT_ASSESSMENT' and sort_order=(v->>'unit')::int and name=case when (v->>'unit')::int=0 then v->>'unit_title' else 'Unit '||(v->>'unit')||' — '||(v->>'unit_title') end) then raise exception 'REPERTOIRE_EXISTING_UNIT_CONFLICT'; end if;
  end loop;
  for v in select value from jsonb_array_elements(b->'lessons') loop
   select id into cid from curriculum_subject_components where subject_id=sid and code='REP-'||(b->>'book')||'-U'||lpad(v->>'unit',2,'0');
   select i.id into iid from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id where c.subject_id=sid and i.code=v->>'code';
   if iid is null then
    insert into curriculum_component_items(component_id,code,name,sort_order,status,is_required) values(cid,v->>'code',v->>'title',(v->>'number')::int,'ACTIVE',false) returning id into iid;
    insert into rep_changes values('lesson',iid);
   end if;
   if not exists(select 1 from curriculum_component_items where id=iid and component_id=cid and name=v->>'title' and sort_order=(v->>'number')::int and status='ACTIVE' and not is_required) then raise exception 'REPERTOIRE_EXISTING_LESSON_CONFLICT'; end if;
   insert into curriculum_lesson_syllabi(item_id,source_book,source_authors,source_sha256,unit_title,source_pdf_pages,source_printed_pages,learning_objectives,classroom_activities,homework,teacher_notes,source_context,content_scope,syllabus_pdf_page)
   values(iid,b->>'subject_name',b->>'source_authors',b->>'source_sha256',v->>'unit_title',v->>'source_pdf_pages',v->>'source_printed_pages',v->>'learning_objectives',v->>'classroom_activities',v->>'homework',v->>'teacher_notes',case when (v->>'number')::int=1 then b->>'source_context' else '' end,v->>'content_scope',(v->>'syllabus_pdf_page')::int) on conflict(item_id) do nothing;
   if found then insert into rep_changes values('syllabus',iid); end if;
   if not exists(select 1 from curriculum_lesson_syllabi g where g.item_id=iid and (g.source_book,g.source_authors,g.source_sha256,g.unit_title,g.source_pdf_pages,g.source_printed_pages,g.learning_objectives,g.classroom_activities,g.homework,g.teacher_notes,g.content_scope,g.syllabus_pdf_page,g.source_context) is not distinct from (b->>'subject_name',b->>'source_authors',b->>'source_sha256',v->>'unit_title',v->>'source_pdf_pages',v->>'source_printed_pages',v->>'learning_objectives',v->>'classroom_activities',v->>'homework',v->>'teacher_notes',v->>'content_scope',(v->>'syllabus_pdf_page')::int,case when (v->>'number')::int=1 then b->>'source_context' else '' end)) then raise exception 'REPERTOIRE_EXISTING_SYLLABUS_CONFLICT'; end if;
  end loop;
  if (select count(*) from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id where c.subject_id=sid)<>50 or (select count(*) from curriculum_subject_components where subject_id=sid)<>(select count(distinct (value->>'unit')::int) from jsonb_array_elements(b->'lessons')) then raise exception 'REPERTOIRE_EXTRA_CONTENT_CONFLICT'; end if;
 end loop;
 -- Preserve all child rows and historical links of the old subject, including its required flags/rules.
 update curriculum_subjects set status='INACTIVE' where id=oldid and status='ACTIVE';
 if found then insert into rep_changes values('retired_subject',oldid); end if;
 foreach t in array array['student_curriculum_enrollments','student_level_progress','student_subject_progress','student_component_progress','student_component_item_progress'] loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,''[]'')) from %I t',t) into digest;
  after_progress:=after_progress||jsonb_build_object(t,digest);
 end loop;
 if before_progress<>after_progress then raise exception 'REPERTOIRE_PROGRESS_CHANGED'; end if;
 select jsonb_agg(to_jsonb(s) order by id) into other_after from curriculum_subjects s where id<>oldid and not(level_id=lid and code in('REPERTOIRE_2A','REPERTOIRE_2B'));
 if other_after is distinct from other_before or old_components is distinct from (select jsonb_agg(to_jsonb(c) order by id) from curriculum_subject_components c where subject_id=oldid) or old_items is distinct from (select jsonb_agg(to_jsonb(i) order by i.id) from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id where c.subject_id=oldid) then raise exception 'REPERTOIRE_UNRELATED_OR_OLD_CONTENT_CHANGED'; end if;
end $rep$;
select jsonb_build_object('changes',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from rep_changes a),'progress_unchanged',true,'old_content_preserved',true,'other_subjects_unchanged',true);
