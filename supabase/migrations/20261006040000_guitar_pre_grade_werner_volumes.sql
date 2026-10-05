-- Guitar Pre Grade: Classical Guitar Method Volumes 1 and 2.
-- Renames the existing method and repertoire subjects when that catalog is already present.
-- A database without GUITAR keeps this function and does not invent a second program.
-- Guitar Pre Grade only. Renames the existing method and repertoire subjects
-- and fills their Core lesson lists from the Werner operator map.
-- A database without GUITAR is left unchanged.

create or replace function public.apply_guitar_pre_werner_v1()
returns jsonb
language plpgsql
as $function$
declare
  plan jsonb := $plan${"level_name":"Pre Grade","previous_level_name":"Pre","volume1_name":"Classical Guitar Method – Volume 1","volume1_previous_name":"Methode Book","volume1_subject_code":"METHODE_BOOK","volume1_source":{"title":"Classical Guitar Method – Volume 1","edition":"2020 Edition","author":"Bradford Werner"},"volume2_name":"Classical Guitar Method – Volume 2","volume2_previous_names":["Repertoire Pre","Repertoire"],"volume2_subject_code":"REPERTOIRE","volume2_source":{"title":"Classical Guitar Method – Volume 2","edition":"2019 Edition","author":"Bradford Werner"},"volume1":[{"code":"L01","title":"Getting Started: Finger Names & Guitar Anatomy","number":1,"section":"Part 1 — Progressive Method"},{"code":"L02","title":"Hand and Sitting Positions for Classical Guitar","number":2,"section":"Part 1 — Progressive Method"},{"code":"L03","title":"Brief Definitions of Music Notation","number":3,"section":"Part 1 — Progressive Method"},{"code":"L04","title":"Notes & Rhythms","number":4,"section":"Part 1 — Progressive Method"},{"code":"L05","title":"Three Open Strings","number":5,"section":"Part 1 — Progressive Method"},{"code":"L06","title":"Rhythms for Etude No. 1","number":6,"section":"Part 1 — Progressive Method"},{"code":"L07","title":"Etude No. 1 – Melody","number":7,"section":"Part 1 — Progressive Method"},{"code":"L08","title":"Etude No. 2 – Arpeggios","number":8,"section":"Part 1 — Progressive Method"},{"code":"L09","title":"Nocturne Duet","number":9,"section":"Part 1 — Progressive Method"},{"code":"L10","title":"Notes on the Third String","number":10,"section":"Part 1 — Progressive Method"},{"code":"L11","title":"Sight Reading & Review: Third String","number":11,"section":"Part 1 — Progressive Method"},{"code":"L12","title":"Moderato","number":12,"section":"Part 1 — Progressive Method"},{"code":"L13","title":"A Fairy Tale","number":13,"section":"Part 1 — Progressive Method"},{"code":"L14","title":"Notes on the First & Second Strings","number":14,"section":"Part 1 — Progressive Method"},{"code":"L15","title":"Note Review & Sight Reading","number":15,"section":"Part 1 — Progressive Method"},{"code":"L16","title":"Five Melodies","number":16,"section":"Part 1 — Progressive Method"},{"code":"L17","title":"Ode to Joy","number":17,"section":"Part 1 — Progressive Method"},{"code":"L18","title":"Sight Reading & Dynamics","number":18,"section":"Part 1 — Progressive Method"},{"code":"L19","title":"Etude No. 3 – Sound Picture","number":19,"section":"Part 1 — Progressive Method"},{"code":"L20","title":"Twinkle, Twinkle, Little Star","number":20,"section":"Part 1 — Progressive Method"},{"code":"L21","title":"Etude No. 4 – The Birds","number":21,"section":"Part 1 — Progressive Method"},{"code":"L22","title":"Jazz Cat","number":22,"section":"Part 1 — Progressive Method"},{"code":"L23","title":"Au clair de la lune","number":23,"section":"Part 1 — Progressive Method"},{"code":"L24","title":"Oh! Susanna","number":24,"section":"Part 1 — Progressive Method"},{"code":"L25","title":"Waltz – Carl Czerny","number":25,"section":"Part 1 — Progressive Method"},{"code":"L26","title":"Minuet – C. H. Wilton","number":26,"section":"Part 1 — Progressive Method"},{"code":"L27","title":"Morning – Anton Diabelli","number":27,"section":"Part 1 — Progressive Method"},{"code":"L28","title":"Open Bass Strings","number":28,"section":"Part 1 — Progressive Method"},{"code":"L29","title":"Etude No. 5 – Waltz","number":29,"section":"Part 1 — Progressive Method"},{"code":"L30","title":"Etude No. 6 – Allegro","number":30,"section":"Part 1 — Progressive Method"},{"code":"L31","title":"Etude No. 7 – The Lonely Dogwood","number":31,"section":"Part 1 — Progressive Method"},{"code":"L32","title":"New Notes: C, D, E, F","number":32,"section":"Part 1 — Progressive Method"},{"code":"L33","title":"Note Review & Etude No. 8 – Prelude","number":33,"section":"Part 1 — Progressive Method"},{"code":"L34","title":"C Major Scale","number":34,"section":"Part 1 — Progressive Method"},{"code":"L35","title":"Eighth Notes","number":35,"section":"Part 1 — Progressive Method"},{"code":"L36","title":"Sight Reading with Eighth Notes","number":36,"section":"Part 1 — Progressive Method"},{"code":"L37","title":"Angeline the Baker","number":37,"section":"Part 1 — Progressive Method"},{"code":"L38","title":"Minuet – James Hook","number":38,"section":"Part 1 — Progressive Method"},{"code":"L39","title":"Etude No. 9 – Glass","number":39,"section":"Part 1 — Progressive Method"},{"code":"L40","title":"Vsi so venci vejli","number":40,"section":"Part 1 — Progressive Method"},{"code":"L41","title":"Flow Gently, Sweet Afton","number":41,"section":"Part 1 — Progressive Method"},{"code":"L42","title":"Two Voice Textures","number":42,"section":"Part 1 — Progressive Method"},{"code":"L43","title":"Etude No. 10 – The Swan","number":43,"section":"Part 1 — Progressive Method"},{"code":"L44","title":"Etude No. 11 – The Old Douglas Fir","number":44,"section":"Part 1 — Progressive Method"},{"code":"L45","title":"Dotted Quarter Notes","number":45,"section":"Part 1 — Progressive Method"},{"code":"L46","title":"Little Birch Tree in the Field","number":46,"section":"Part 1 — Progressive Method"},{"code":"L47","title":"The Skye Boat Song","number":47,"section":"Part 1 — Progressive Method"},{"code":"L48","title":"Fifth & Sixth String Notes / Note Review","number":48,"section":"Part 1 — Progressive Method"},{"code":"L49","title":"Accidentals, Chromatic Scale & Leyenda Theme","number":49,"section":"Part 1 — Progressive Method"},{"code":"L50","title":"Final Volume 1 Repertoire & Technique Review","number":50,"section":"Part 1 close, with Part 2 chord and fingerstyle exposure and Part 3 technique review"}],"volume2":[{"code":"L01","title":"C Major: Scale, Arpeggio, Triads & Chord Progression","number":1,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L02","title":"Menuet en Rondeau – Jean-Philippe Rameau","number":2,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L03","title":"Vals, Op. 241, No. 1 – Ferdinando Carulli","number":3,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L04","title":"Morning Has Broken","number":4,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L05","title":"A Melodic Minor: Scale, Arpeggio, Triads & Chords","number":5,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L06","title":"Romance No. 14, Op. 168 – Joseph Küffner","number":6,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L07","title":"Lección No. 46 – Julio Sagreras","number":7,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L08","title":"Star of County Down","number":8,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L09","title":"G Major: Scale, Arpeggio, Triads & Chords","number":9,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L10","title":"Minuet – J. S. Bach","number":10,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L11","title":"Kean O'Hara – Turlough O'Carolan","number":11,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L12","title":"E Melodic Minor: Scale, Arpeggio, Triads & Chords","number":12,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L13","title":"Erster Verlust No. 16, Op. 68 – Robert Schumann","number":13,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L14","title":"Prelude in E Minor","number":14,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L15","title":"D Major: Scale, Arpeggio, Triads & Chords","number":15,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L16","title":"Le Petit Rien – François Couperin","number":16,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L17","title":"La Volte","number":17,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L18","title":"A Major: Scale, Arpeggio, Triads & Chords","number":18,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L19","title":"Menuet in A, HWV 545 – G. F. Handel","number":19,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L20","title":"Lección No. 54 – Julio Sagreras","number":20,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L21","title":"Bound for South Australia","number":21,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L22","title":"F Major: Scale, Arpeggio, Triads & Chords","number":22,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L23","title":"Melody by Mertz","number":23,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L24","title":"D Melodic Minor: Scale, Arpeggio, Triads & Chords","number":24,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L25","title":"Riguadon – Jean-Philippe Rameau","number":25,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L26","title":"Lección No. 55 – Julio Sagreras","number":26,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L27","title":"Single String Chromatic Scales","number":27,"section":"Part 1 — Reading Music & Chords in Common Keys"},{"code":"L28","title":"Introduction to 3rd & 5th Position","number":28,"section":"Part 2 — Introduction to 3rd & 5th Position"},{"code":"L29","title":"Ode to Joy in 1st, 3rd & 5th Position","number":29,"section":"Part 2 — Introduction to 3rd & 5th Position"},{"code":"L30","title":"Position Exercises No. 1–5","number":30,"section":"Part 2 — Introduction to 3rd & 5th Position"},{"code":"L31","title":"To the Highest Note in Position / Twinkle Twinkle Little Star","number":31,"section":"Part 2 — Introduction to 3rd & 5th Position"},{"code":"L32","title":"Position Exercises No. 6–10","number":32,"section":"Part 2 — Introduction to 3rd & 5th Position"},{"code":"L33","title":"Joy to the World","number":33,"section":"Part 2 — Introduction to 3rd & 5th Position"},{"code":"L34","title":"El Noi de la Mare","number":34,"section":"Part 2 — Introduction to 3rd & 5th Position"},{"code":"L35","title":"Position Shifts","number":35,"section":"Part 2 — Introduction to 3rd & 5th Position"},{"code":"L36","title":"The Canaries or the Hay","number":36,"section":"Part 2 — Introduction to 3rd & 5th Position"},{"code":"L37","title":"Feng Yang Flower Drum","number":37,"section":"Part 2 — Introduction to 3rd & 5th Position"},{"code":"L38","title":"Captain O'Kane","number":38,"section":"Part 2 — Introduction to 3rd & 5th Position"},{"code":"L39","title":"Tips for Counting Rhythms","number":39,"section":"Part 3 — Rhythm Training"},{"code":"L40","title":"Rhythm Exercises No. 1–10","number":40,"section":"Part 3 — Rhythm Training"},{"code":"L41","title":"Rhythm Exercises No. 11–20","number":41,"section":"Part 3 — Rhythm Training"},{"code":"L42","title":"Rhythm Exercises No. 21–30","number":42,"section":"Part 3 — Rhythm Training"},{"code":"L43","title":"Rhythm Exercises No. 31–40","number":43,"section":"Part 3 — Rhythm Training"},{"code":"L44","title":"Rhythm Exercises No. 41–50","number":44,"section":"Part 3 — Rhythm Training"},{"code":"L45","title":"Rhythm Exercises No. 51–60","number":45,"section":"Part 3 — Rhythm Training"},{"code":"L46","title":"Right-Hand Alternation & Open-String Exercises","number":46,"section":"Part 4 — Technique & Warm-up Exercises"},{"code":"L47","title":"Basic Arpeggio Patterns with p, i, m, a","number":47,"section":"Part 4 — Technique & Warm-up Exercises"},{"code":"L48","title":"Two-Voice Patterns & Awkward String Crossings","number":48,"section":"Part 4 — Technique & Warm-up Exercises"},{"code":"L49","title":"Left-Hand Exercises & Moveable Scale Patterns","number":49,"section":"Part 4 — Technique & Warm-up Exercises"},{"code":"L50","title":"Barre, Position Playing & Volume 2 Review","number":50,"section":"Part 4 — Technique & Warm-up Exercises"}]}$plan$::jsonb;
  program uuid;
  v_level uuid;
  method_id uuid;
  repertoire_id uuid;
  method_component uuid;
  repertoire_component uuid;
  outside_before text;
  grades_before text;
  siblings_before text;
  identity_before text;
  progress_before jsonb;
  progress_count integer;
  v_repertoire_sort integer;
  lesson jsonb;
  v_item uuid;
  v_item_name text;
  renamed integer := 0;
  created integer := 0;
  kept integer := 0;
  active_count integer;
  code_count integer;
begin
  select id into program from public.curriculums where code = 'GUITAR';
  if program is null then
    return jsonb_build_object('applied', false, 'reason', 'GUITAR_NOT_PRESENT');
  end if;

  select id into v_level
  from public.curriculum_levels
  where curriculum_id = program and code = 'PRE';
  if v_level is null then
    raise exception 'GUITAR_PRE_LEVEL_MISSING';
  end if;
  if (select name from public.curriculum_levels where id = v_level) not in (plan->>'previous_level_name', plan->>'level_name') then
    raise exception 'GUITAR_PRE_LEVEL_NAME_CONFLICT';
  end if;

  select id into method_id
  from public.curriculum_subjects
  where level_id = v_level and code = plan->>'volume1_subject_code';
  select id into repertoire_id
  from public.curriculum_subjects
  where level_id = v_level and code = plan->>'volume2_subject_code';
  if method_id is null or repertoire_id is null then
    raise exception 'GUITAR_PRE_SUBJECTS_MISSING';
  end if;
  if (select name from public.curriculum_subjects where id = method_id) not in (plan->>'volume1_previous_name', plan->>'volume1_name') then
    raise exception 'GUITAR_METHOD_NAME_CONFLICT';
  end if;
  if not exists (
    select 1
    from public.curriculum_subjects
    where id = repertoire_id
      and name in (
        select jsonb_array_elements_text(plan->'volume2_previous_names')
        union all
        select plan->>'volume2_name'
      )
  ) then
    raise exception 'GUITAR_REPERTOIRE_NAME_CONFLICT';
  end if;

  if (select count(*) from public.curriculum_subject_components where subject_id = method_id) > 1 then
    raise exception 'GUITAR_METHOD_MULTIPLE_COMPONENTS';
  end if;
  if (select count(*) from public.curriculum_subject_components where subject_id = repertoire_id) <> 1 then
    raise exception 'GUITAR_REPERTOIRE_COMPONENT_CONFLICT';
  end if;

  select id into method_component
  from public.curriculum_subject_components
  where subject_id = method_id;
  select id into repertoire_component
  from public.curriculum_subject_components
  where subject_id = repertoire_id and code = 'CORE';
  if repertoire_component is null then
    raise exception 'GUITAR_REPERTOIRE_COMPONENT_CONFLICT';
  end if;
  if method_component is not null and (select code from public.curriculum_subject_components where id = method_component) <> 'CORE' then
    raise exception 'GUITAR_METHOD_COMPONENT_CONFLICT';
  end if;

  select md5(coalesce(string_agg(line, '|' order by line), '')) into outside_before
  from (
    select concat_ws(':', p.code, l.code, l.name, s.code, s.name, s.status, c.code, i.code, i.name, i.status, i.sort_order::text) as line
    from public.curriculums p
    join public.curriculum_levels l on l.curriculum_id = p.id
    left join public.curriculum_subjects s on s.level_id = l.id
    left join public.curriculum_subject_components c on c.subject_id = s.id
    left join public.curriculum_component_items i on i.component_id = c.id
    where p.code <> 'GUITAR'
  ) rows;
  select md5(coalesce(string_agg(line, '|' order by line), '')) into grades_before
  from (
    select concat_ws(':', l.code, l.name, s.code, s.name, s.status, c.code, i.id::text, i.code, i.name, i.status, i.sort_order::text) as line
    from public.curriculum_levels l
    left join public.curriculum_subjects s on s.level_id = l.id
    left join public.curriculum_subject_components c on c.subject_id = s.id
    left join public.curriculum_component_items i on i.component_id = c.id
    where l.curriculum_id = program and l.code <> 'PRE'
  ) rows;
  select md5(coalesce(string_agg(line, '|' order by line), '')) into siblings_before
  from (
    select concat_ws(':', s.code, s.name, s.status, s.is_required::text, c.code, i.id::text, i.code, i.name, i.status, i.sort_order::text) as line
    from public.curriculum_subjects s
    left join public.curriculum_subject_components c on c.subject_id = s.id
    left join public.curriculum_component_items i on i.component_id = c.id
    where s.level_id = v_level and s.id not in (method_id, repertoire_id)
  ) rows;
  select md5(coalesce(string_agg(line, '|' order by line), '')) into identity_before
  from (
    select concat_ws(':', code, family_code, is_required::text, completion_rule, coalesce(subject_level::text, '')) as line
    from public.curriculum_subjects
    where id in (method_id, repertoire_id)
  ) rows;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'item_id', p.item_id, 'status', p.status) order by p.id), '[]'::jsonb)
    into progress_before
  from public.student_component_item_progress p
  where p.item_id in (
    select i.id
    from public.curriculum_component_items i
    where i.component_id in (repertoire_component, method_component)
  );
  select count(*) into progress_count from public.student_component_item_progress;
  select sort_order into v_repertoire_sort from public.curriculum_subjects where id = repertoire_id;

  update public.curriculum_levels
  set name = plan->>'level_name'
  where id = v_level and name is distinct from plan->>'level_name';

  update public.curriculum_subjects
  set name = plan->>'volume1_name',
      status = 'ACTIVE',
      sort_order = 0
  where id = method_id;

  update public.curriculum_subjects
  set name = plan->>'volume2_name'
  where id = repertoire_id;

  if method_component is null then
    insert into public.curriculum_subject_components (
      subject_id, code, name, is_required, sort_order, completion_rule, status
    ) values (
      method_id, 'CORE', 'Core', true, 1, 'ALL_REQUIRED_ITEMS', 'ACTIVE'
    )
    returning id into method_component;
  end if;

  for lesson in select value from jsonb_array_elements(plan->'volume2')
  loop
    v_item := null;
    v_item_name := null;
    select i.id, i.name into v_item, v_item_name
    from public.curriculum_component_items i
    where i.component_id = repertoire_component and i.code = lesson->>'code';
    if not found then
      insert into public.curriculum_component_items (
        component_id, code, name, sort_order, is_required, status
      ) values (
        repertoire_component, lesson->>'code', lesson->>'title', (lesson->>'number')::int, true, 'ACTIVE'
      );
      created := created + 1;
    elsif v_item_name = lesson->>'title' then
      update public.curriculum_component_items
      set sort_order = (lesson->>'number')::int,
          is_required = true,
          status = 'ACTIVE'
      where id = v_item;
      kept := kept + 1;
    elsif v_item_name ~ '^Lesson [0-9]{2}$' then
      update public.curriculum_component_items
      set name = lesson->>'title',
          sort_order = (lesson->>'number')::int,
          is_required = true,
          status = 'ACTIVE'
      where id = v_item;
      renamed := renamed + 1;
    else
      raise exception 'GUITAR_EXISTING_LESSON_CONFLICT';
    end if;
  end loop;

  for lesson in select value from jsonb_array_elements(plan->'volume1')
  loop
    v_item := null;
    v_item_name := null;
    select i.id, i.name into v_item, v_item_name
    from public.curriculum_component_items i
    where i.component_id = method_component and i.code = lesson->>'code';
    if not found then
      insert into public.curriculum_component_items (
        component_id, code, name, sort_order, is_required, status
      ) values (
        method_component, lesson->>'code', lesson->>'title', (lesson->>'number')::int, true, 'ACTIVE'
      );
      created := created + 1;
    elsif v_item_name = lesson->>'title' then
      update public.curriculum_component_items
      set sort_order = (lesson->>'number')::int,
          is_required = true,
          status = 'ACTIVE'
      where id = v_item;
      kept := kept + 1;
    elsif v_item_name ~ '^Lesson [0-9]{2}$' then
      update public.curriculum_component_items
      set name = lesson->>'title',
          sort_order = (lesson->>'number')::int,
          is_required = true,
          status = 'ACTIVE'
      where id = v_item;
      renamed := renamed + 1;
    else
      raise exception 'GUITAR_EXISTING_LESSON_CONFLICT';
    end if;
  end loop;

  select count(*) into active_count
  from public.curriculum_component_items
  where component_id = method_component and status = 'ACTIVE';
  if active_count <> 50 then
    raise exception 'GUITAR_VOLUME1_ACTIVE_COUNT';
  end if;
  select count(*) into active_count
  from public.curriculum_component_items
  where component_id = repertoire_component and status = 'ACTIVE';
  if active_count <> 50 then
    raise exception 'GUITAR_VOLUME2_ACTIVE_COUNT';
  end if;
  if exists (
    select 1 from public.curriculum_component_items
    where component_id in (method_component, repertoire_component)
      and status = 'ACTIVE'
      and (is_required is distinct from true or code !~ '^L[0-9]{2}$' or sort_order not between 1 and 50)
  ) then
    raise exception 'GUITAR_LESSON_SHAPE';
  end if;
  select count(distinct code) into code_count
  from public.curriculum_component_items
  where component_id = method_component and status = 'ACTIVE';
  if code_count <> 50 then
    raise exception 'GUITAR_VOLUME1_CODE_COLLISION';
  end if;
  select count(distinct code) into code_count
  from public.curriculum_component_items
  where component_id = repertoire_component and status = 'ACTIVE';
  if code_count <> 50 then
    raise exception 'GUITAR_VOLUME2_CODE_COLLISION';
  end if;
  if exists (
    select 1
    from public.curriculum_component_items
    where component_id in (method_component, repertoire_component) and status = 'ACTIVE'
    group by component_id, sort_order
    having count(*) <> 1
  ) then
    raise exception 'GUITAR_DUPLICATE_SORT';
  end if;
  if exists (
    select 1
    from public.curriculum_component_items
    where component_id in (method_component, repertoire_component)
      and id not in (
        select i.id
        from public.curriculum_component_items i
        where i.status = 'ACTIVE' and i.sort_order between 1 and 50
      )
  ) then
    raise exception 'GUITAR_UNEXPECTED_EXTRA_LESSON';
  end if;

  if progress_before is distinct from (
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'item_id', p.item_id, 'status', p.status) order by p.id), '[]'::jsonb)
    from public.student_component_item_progress p
    where p.item_id in (
      select i.id from public.curriculum_component_items i
      where i.component_id in (method_component, repertoire_component)
    )
  ) or (select count(*) from public.student_component_item_progress) <> progress_count then
    raise exception 'GUITAR_PROGRESS_CHANGED';
  end if;
  if outside_before is distinct from (
    select md5(coalesce(string_agg(line, '|' order by line), ''))
    from (
      select concat_ws(':', p.code, l.code, l.name, s.code, s.name, s.status, c.code, i.code, i.name, i.status, i.sort_order::text) as line
      from public.curriculums p
      join public.curriculum_levels l on l.curriculum_id = p.id
      left join public.curriculum_subjects s on s.level_id = l.id
      left join public.curriculum_subject_components c on c.subject_id = s.id
      left join public.curriculum_component_items i on i.component_id = c.id
      where p.code <> 'GUITAR'
    ) rows
  ) or grades_before is distinct from (
    select md5(coalesce(string_agg(line, '|' order by line), ''))
    from (
      select concat_ws(':', l.code, l.name, s.code, s.name, s.status, c.code, i.id::text, i.code, i.name, i.status, i.sort_order::text) as line
      from public.curriculum_levels l
      left join public.curriculum_subjects s on s.level_id = l.id
      left join public.curriculum_subject_components c on c.subject_id = s.id
      left join public.curriculum_component_items i on i.component_id = c.id
      where l.curriculum_id = program and l.code <> 'PRE'
    ) rows
  ) or siblings_before is distinct from (
    select md5(coalesce(string_agg(line, '|' order by line), ''))
    from (
      select concat_ws(':', s.code, s.name, s.status, s.is_required::text, c.code, i.id::text, i.code, i.name, i.status, i.sort_order::text) as line
      from public.curriculum_subjects s
      left join public.curriculum_subject_components c on c.subject_id = s.id
      left join public.curriculum_component_items i on i.component_id = c.id
      where s.level_id = v_level and s.id not in (method_id, repertoire_id)
    ) rows
  ) or identity_before is distinct from (
    select md5(coalesce(string_agg(line, '|' order by line), ''))
    from (
      select concat_ws(':', code, family_code, is_required::text, completion_rule, coalesce(subject_level::text, '')) as line
      from public.curriculum_subjects
      where id in (method_id, repertoire_id)
    ) rows
  ) or (select sort_order from public.curriculum_subjects where id = repertoire_id) is distinct from v_repertoire_sort then
    raise exception 'GUITAR_UNRELATED_CONTENT_CHANGED';
  end if;

  return jsonb_build_object(
    'applied', true,
    'renamed', renamed,
    'created', created,
    'kept', kept,
    'retired', 0,
    'volume1_active', 50,
    'volume2_active', 50
  );
end;
$function$;

revoke all on function public.apply_guitar_pre_werner_v1() from public, anon, authenticated, service_role;
select public.apply_guitar_pre_werner_v1();

