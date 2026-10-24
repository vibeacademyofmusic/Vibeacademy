-- Used only inside the transaction built by local-violin-piano-curriculum.cjs.
-- Draft lesson storage is NOT an approved assessment-component mapping.
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('vibe:violin-piano-authoring:20261005',0));
lock table public.curriculums, public.curriculum_levels, public.curriculum_subjects,
  public.curriculum_subject_components, public.curriculum_component_items in share row exclusive mode;
lock table public.student_curriculum_enrollments, public.student_level_progress,
  public.student_subject_progress, public.student_component_progress,
  public.student_component_item_progress in share mode;

create temp table vp_audit(kind text, id uuid, detail jsonb) on commit drop;
create temp table vp_subjects(program_id uuid, level_id uuid, subject_id uuid, before_count int) on commit drop;
create temp table vp_levels(program_id uuid, level_id uuid, rank int, unique(program_id,rank)) on commit drop;
create temp table vp_progress(table_name text, digest text) on commit drop;

create or replace function pg_temp.vp_norm(v text) returns text language sql immutable as $$
  select regexp_replace(upper(trim(v)), '[^A-Z0-9]', '', 'g')
$$;

do $import$
declare
  program jsonb; level jsonb; subject jsonb; existing record; entry record;
  p uuid; l uuid; s uuid; c uuid; item uuid; candidates uuid[];
  r int; seq int; n int; ordinal int; lesson_code text; subject_sort int;
  tbl text; before_hash text; after_hash text;
begin
  foreach tbl in array array['student_curriculum_enrollments','student_level_progress',
    'student_subject_progress','student_component_progress','student_component_item_progress'] loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,''[]'')) from public.%I t',tbl) into before_hash;
    insert into vp_progress values(tbl,before_hash);
  end loop;

  for program in select value from jsonb_array_elements((select payload from vp_plan)) loop
    -- Reuse the canonical code, or the legacy TEST_ identity, instead of opening a second tree.
    select id into p from public.curriculums where code = program->>'code';
    if p is null then
      select id into p from public.curriculums where code = 'TEST_' || (program->>'code');
    end if;
    if exists (
      select 1 from public.curriculums other
      where other.id is distinct from p
        and (
          pg_temp.vp_norm(other.code) = program->>'code'
          or lower(trim(other.name)) = lower(program->>'name')
          or other.code = 'TEST_' || (program->>'code')
        )
    ) then
      raise exception 'Ambiguous official program %; reconcile identities before import', program->>'code';
    end if;
    if p is not null and exists(select 1 from public.curriculums where id=p and (
      (pg_temp.vp_norm(code) in ('PIANO','VIOLIN','DRUMS','GUITAR') and pg_temp.vp_norm(code)<>program->>'code')
      or (pg_temp.vp_norm(name) in ('PIANO','VIOLIN','DRUMS','GUITAR') and pg_temp.vp_norm(name)<>program->>'code'))) then
      raise exception 'Conflicting program code/name for %',program->>'code';
    end if;
    if p is null then
      insert into public.curriculums(code,name,description,status)
      values(program->>'code',program->>'name','Khung biên soạn: 10 mục Lesson/môn; chưa duyệt nội dung hoặc tiêu chí đánh giá.','INACTIVE') returning id into p;
      insert into vp_audit values('program',p,jsonb_build_object('code',program->>'code'));
    end if;

    -- Recognize both G1 and GRADE_1, including existing Piano grades as anchors.
    for existing in select * from public.curriculum_levels where curriculum_id=p order by sequence_no loop
      r:=null;
      if pg_temp.vp_norm(existing.code)='PRESTEP' or pg_temp.vp_norm(existing.name)='PRESTEP' then r:=-1;
      elsif pg_temp.vp_norm(existing.code) in ('PRE','PREGRADE') or pg_temp.vp_norm(existing.name) in ('PRE','PREGRADE') then r:=0;
      elsif existing.level_type='GRADE' and existing.level_number between 1 and 8 then r:=existing.level_number;
      else
        for n in 1..8 loop
          if pg_temp.vp_norm(existing.code) in ('G'||n,'GRADE'||n) or pg_temp.vp_norm(existing.name)='GRADE'||n then r:=n; exit; end if;
        end loop;
      end if;
      if r is not null then
        for n in 1..8 loop
          if (pg_temp.vp_norm(existing.code) in ('G'||n,'GRADE'||n) or pg_temp.vp_norm(existing.name)='GRADE'||n) and n<>r then
            raise exception 'Conflicting level identity: % / %',program->>'code',existing.code;
          end if;
        end loop;
        if (r<=0 and (existing.level_type<>'FOUNDATION' or existing.level_number is not null))
          or (r>0 and (existing.level_type<>'GRADE' or existing.level_number is distinct from r)) then
          raise exception 'Conflicting level identity: % / %',program->>'code',existing.code;
        end if;
        if exists(select 1 from vp_levels where program_id=p and rank=r) then
          raise exception 'Duplicate semantic level: % / %',program->>'code',r;
        end if;
        insert into vp_levels values(p,existing.id,r);
      end if;
    end loop;
    if exists(select 1 from vp_levels a join vp_levels b on a.program_id=b.program_id and a.rank<b.rank
      join public.curriculum_levels la on la.id=a.level_id join public.curriculum_levels lb on lb.id=b.level_id
      where a.program_id=p and la.sequence_no>=lb.sequence_no) then
      raise exception 'Existing level order conflicts with Pre Step / Pre / Grade order for %',program->>'code';
    end if;

    for level in select value from jsonb_array_elements(program->'levels') loop
      r:=(level->>'rank')::int;
      select level_id into l from vp_levels where program_id=p and rank=r;
      if l is null then
        select min(cl.sequence_no) into seq from vp_levels v join public.curriculum_levels cl on cl.id=v.level_id
          where v.program_id=p and v.rank>r;
        if seq is null then
          select coalesce(max(sequence_no),0)+1 into seq from public.curriculum_levels where curriculum_id=p;
        else
          -- Make a positive slot without changing relative order or existing IDs.
          for entry in select id,sequence_no from public.curriculum_levels where curriculum_id=p and sequence_no>=seq order by sequence_no desc loop
            update public.curriculum_levels set sequence_no=entry.sequence_no+1 where id=entry.id;
            insert into vp_audit values('sequence',entry.id,jsonb_build_object('from',entry.sequence_no,'to',entry.sequence_no+1));
          end loop;
        end if;
        insert into public.curriculum_levels(curriculum_id,code,name,sequence_no,level_number,level_type,completion_rule,status)
        values(p,level->>'code',level->>'name',seq,(level->>'grade')::int,level->>'levelType','MANUAL','INACTIVE') returning id into l;
        insert into vp_levels values(p,l,r);
        insert into vp_audit values('level',l,jsonb_build_object('code',level->>'code'));
      end if;
      subject_sort:=0;
      for subject in select value from jsonb_array_elements(level->'subjects') loop
        subject_sort:=subject_sort+1;
        select array_agg(id) into candidates from public.curriculum_subjects
        where level_id=l and (pg_temp.vp_norm(code)=pg_temp.vp_norm(subject->>'code')
          or pg_temp.vp_norm(name)=pg_temp.vp_norm(subject->>'name')
          or pg_temp.vp_norm(name)=pg_temp.vp_norm((subject->>'name')||' '||(level->>'name'))
          or (r>0 and pg_temp.vp_norm(name)=pg_temp.vp_norm((subject->>'name')||' '||r)));
        if coalesce(cardinality(candidates),0)>1 then
          raise exception 'Ambiguous subject % / % / %',program->>'code',level->>'code',subject->>'code';
        end if;
        s:=candidates[1];
        if s is null then
          insert into public.curriculum_subjects(level_id,code,name,family_code,subject_level,sort_order,status,is_required,completion_rule)
          values(l,subject->>'code',subject->>'name',subject->>'family',(level->>'grade')::int,subject_sort,'INACTIVE',false,'MANUAL') returning id into s;
          insert into vp_audit values('subject',s,jsonb_build_object('code',subject->>'code'));
        end if;
        select count(*) into n from public.curriculum_component_items i
          join public.curriculum_subject_components cc on cc.id=i.component_id where cc.subject_id=s;
        insert into vp_subjects values(p,l,s,n);
        if n>=10 then continue; end if;

        -- An explicitly inactive, optional container avoids assigning new lessons
        -- to an unapproved live assessment group. Existing groups remain intact.
        select * into existing from public.curriculum_subject_components where subject_id=s and code='LESSON_DRAFTS';
        if found then
          if existing.status<>'INACTIVE' or existing.is_required or existing.completion_rule<>'DIRECT_ASSESSMENT' then
            raise exception 'LESSON_DRAFTS is no longer an inactive authoring container for subject %',s;
          end if;
          c:=existing.id;
        else
          insert into public.curriculum_subject_components(subject_id,code,name,is_required,sort_order,completion_rule,status)
          select s,'LESSON_DRAFTS','Bài học dự thảo',false,coalesce(max(sort_order),0)+1,'DIRECT_ASSESSMENT','INACTIVE'
            from public.curriculum_subject_components where subject_id=s returning id into c;
          insert into vp_audit values('component',c,jsonb_build_object('subject_id',s));
        end if;
        for ordinal in 1..10 loop
          exit when n>=10;
          lesson_code:='L'||lpad(ordinal::text,2,'0');
          if exists(select 1 from public.curriculum_component_items i join public.curriculum_subject_components cc on cc.id=i.component_id
            where cc.subject_id=s and (upper(i.code)=lesson_code or upper(i.code) ~ ('^L0*'||ordinal||'$'))) then continue; end if;
          insert into public.curriculum_component_items(component_id,code,name,sort_order,is_required,status)
          values(c,lesson_code,'Lesson '||lpad(ordinal::text,2,'0'),ordinal,false,'INACTIVE') returning id into item;
          insert into vp_audit values('lesson',item,jsonb_build_object('subject_id',s,'code',lesson_code));
          n:=n+1;
        end loop;
        if n<>10 then raise exception 'Cannot safely fill 10 lesson slots for subject %',s; end if;
      end loop;
    end loop;
  end loop;

  for entry in select * from vp_progress loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,''[]'')) from public.%I t',entry.table_name) into after_hash;
    if after_hash is distinct from entry.digest then raise exception 'Student progress changed: %',entry.table_name; end if;
  end loop;
end $import$;

select jsonb_build_object(
  'changes',coalesce((select jsonb_agg(to_jsonb(a)) from vp_audit a),'[]'::jsonb),
  'subjects',coalesce((select jsonb_agg(jsonb_build_object(
    'program_id',v.program_id,'level_id',v.level_id,'subject_id',v.subject_id,'before_count',v.before_count,
    'after_count',(select count(*) from public.curriculum_component_items i join public.curriculum_subject_components c on c.id=i.component_id where c.subject_id=v.subject_id),
    'preserved_more_than_ten',v.before_count>10,
    'authoring_path','/admin/academic/'||v.program_id||'/levels/'||v.level_id||'/subjects/'||v.subject_id||'?lessons=all'
  )) from vp_subjects v),'[]'::jsonb),
  'progress_unchanged',true,
  'content_state','LESSON_SLOTS_ONLY_NOT_APPROVED_TEACHING_CONTENT'
) as report;
