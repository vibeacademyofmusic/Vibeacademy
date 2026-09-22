-- Learning observation taxonomy and quick-entry journals.
-- Existing learning_journals rows stay unchanged.
-- Observations do not award academic progress or a student score.

set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $preflight$
begin
  if to_regclass('public.learning_journals') is null
     or to_regclass('public.attendance_records') is null
     or to_regclass('public.session_occurrences') is null
     or to_regclass('public.student_component_item_progress') is null
  then
    raise exception 'LEARNING_TAXONOMY_PREREQUISITE_MISSING';
  end if;
  if to_regclass('public.learning_observation_options') is not null then
    raise exception 'LEARNING_TAXONOMY_ALREADY_EXISTS';
  end if;
end;
$preflight$;

create table public.learning_observation_options (
  code text primary key,
  dimension text not null check (dimension in ('TECHNIQUE','RHYTHM','ACCURACY','READING','MUSICALITY','INDEPENDENCE','PRACTICE_HABIT')),
  development_level text not null check (development_level in ('NEEDS_SUPPORT','DEVELOPING','GUIDED_STABLE','STABLE','INDEPENDENT')),
  signal text not null check (signal in ('STRENGTH','DEVELOPMENT')),
  label_vi text not null check (char_length(btrim(label_vi)) between 1 and 200),
  draft_clause_vi text not null check (char_length(btrim(draft_clause_vi)) between 1 and 240),
  description_vi text not null default '',
  active boolean not null default true,
  sort_order integer not null,
  instrument_extension text,
  created_at timestamptz not null default clock_timestamp(),
  unique (dimension, sort_order)
);

insert into public.learning_observation_options(code, dimension, development_level, signal, label_vi, draft_clause_vi, sort_order)
values
  ('TECH_FOUNDATION_NEEDS_SUPPORT', 'TECHNIQUE', 'NEEDS_SUPPORT', 'DEVELOPMENT', 'Cần tiếp tục củng cố kỹ thuật nền tảng', 'kỹ thuật nền tảng vẫn cần được củng cố', 1),
  ('TECH_MOVEMENT_TENSION', 'TECHNIQUE', 'DEVELOPING', 'DEVELOPMENT', 'Chuyển động còn căng, cần tăng độ thả lỏng', 'chuyển động còn căng và cần thêm độ thả lỏng', 2),
  ('TECH_FINGERING_UNSTABLE', 'TECHNIQUE', 'DEVELOPING', 'DEVELOPMENT', 'Fingering/chuyển vị trí chưa ổn định', 'Fingering/chuyển vị trí vẫn cần tiếp tục củng cố', 3),
  ('TECH_STABLE_SLOW', 'TECHNIQUE', 'GUIDED_STABLE', 'STRENGTH', 'Kỹ thuật đã ổn định ở tốc độ chậm', 'kỹ thuật đã ổn định ở tốc độ chậm', 4),
  ('TECH_STABLE_CURRENT_TEMPO', 'TECHNIQUE', 'STABLE', 'STRENGTH', 'Kỹ thuật ổn định ở tốc độ hiện tại', 'kỹ thuật ổn định ở tốc độ hiện tại', 5),
  ('TECH_ACCURACY_DROPS_WITH_SPEED', 'TECHNIQUE', 'DEVELOPING', 'DEVELOPMENT', 'Độ chính xác kỹ thuật giảm khi tăng tốc độ', 'độ chính xác kỹ thuật giảm khi tăng tốc độ', 6),
  ('TECH_REQUIRES_FEWER_REMINDERS', 'TECHNIQUE', 'STABLE', 'STRENGTH', 'Thực hiện kỹ thuật với ít nhắc nhở hơn', 'thực hiện kỹ thuật với ít nhắc nhở hơn', 7),
  ('TECH_INDEPENDENT', 'TECHNIQUE', 'INDEPENDENT', 'STRENGTH', 'Có thể thực hiện kỹ thuật tương đối độc lập', 'có thể thực hiện kỹ thuật tương đối độc lập', 8),
  ('RHYTHM_PULSE_UNSTABLE', 'RHYTHM', 'NEEDS_SUPPORT', 'DEVELOPMENT', 'Pulse chưa ổn định ở tốc độ hiện tại', 'pulse chưa ổn định ở tốc độ hiện tại', 101),
  ('RHYTHM_TRANSITION_UNSTABLE', 'RHYTHM', 'DEVELOPING', 'DEVELOPMENT', 'Nhịp chưa ổn định tại các đoạn chuyển', 'nhịp chưa ổn định tại các đoạn chuyển', 102),
  ('RHYTHM_SUBDIVISION_NEEDS_SUPPORT', 'RHYTHM', 'DEVELOPING', 'DEVELOPMENT', 'Cần củng cố khả năng chia phách', 'khả năng chia phách vẫn cần được củng cố', 103),
  ('RHYTHM_CORRECT_DURATIONS', 'RHYTHM', 'GUIDED_STABLE', 'STRENGTH', 'Thực hiện đúng trường độ cơ bản', 'thực hiện đúng trường độ cơ bản', 104),
  ('RHYTHM_STABLE_WITH_METRONOME', 'RHYTHM', 'GUIDED_STABLE', 'STRENGTH', 'Giữ nhịp ổn định khi sử dụng metronome', 'giữ nhịp ổn định khi sử dụng metronome', 105),
  ('RHYTHM_STABLE_PULSE', 'RHYTHM', 'STABLE', 'STRENGTH', 'Duy trì pulse ổn định', 'duy trì nhịp khá ổn định', 106),
  ('RHYTHM_STABLE_THROUGH_SECTION', 'RHYTHM', 'STABLE', 'STRENGTH', 'Duy trì tempo ổn định xuyên suốt đoạn nhạc', 'duy trì tempo ổn định xuyên suốt đoạn nhạc', 107),
  ('RHYTHM_INDEPENDENT', 'RHYTHM', 'INDEPENDENT', 'STRENGTH', 'Có thể duy trì tempo ổn định mà ít cần hỗ trợ', 'có thể duy trì tempo ổn định mà ít cần hỗ trợ', 108),
  ('ACCURACY_NEEDS_SLOWER_TEMPO', 'ACCURACY', 'NEEDS_SUPPORT', 'DEVELOPMENT', 'Cần giảm tốc độ để duy trì độ chính xác', 'cần giảm tốc độ để duy trì độ chính xác', 201),
  ('ACCURACY_ERRORS_AT_TRANSITIONS', 'ACCURACY', 'DEVELOPING', 'DEVELOPMENT', 'Sai sót tập trung ở các đoạn chuyển', 'sai sót tập trung ở các đoạn chuyển', 202),
  ('ACCURACY_DROPS_WITH_SPEED', 'ACCURACY', 'DEVELOPING', 'DEVELOPMENT', 'Độ chính xác giảm khi tăng tốc độ', 'độ chính xác giảm khi tăng tốc độ', 203),
  ('ACCURACY_CURRENT_TEMPO', 'ACCURACY', 'GUIDED_STABLE', 'STRENGTH', 'Thực hiện đúng nốt/cao độ ở tốc độ hiện tại', 'thực hiện đúng nốt/cao độ ở tốc độ hiện tại', 204),
  ('ACCURACY_PRACTICED_SECTIONS_STABLE', 'ACCURACY', 'STABLE', 'STRENGTH', 'Các đoạn đã luyện có độ chính xác ổn định', 'các đoạn đã luyện có độ chính xác ổn định', 205),
  ('ACCURACY_IMPROVED', 'ACCURACY', 'STABLE', 'STRENGTH', 'Độ chính xác được cải thiện so với các buổi trước', 'độ chính xác đã cải thiện', 206),
  ('ACCURACY_SELF_CORRECT_AFTER_CUE', 'ACCURACY', 'STABLE', 'STRENGTH', 'Có thể tự sửa lỗi sau khi được nhắc', 'có thể tự sửa lỗi sau khi được nhắc', 207),
  ('ACCURACY_SELF_DETECT_AND_CORRECT', 'ACCURACY', 'INDEPENDENT', 'STRENGTH', 'Có thể tự nhận ra và sửa một số lỗi', 'có thể tự nhận ra và sửa một số lỗi', 208),
  ('READING_NOTE_BY_NOTE', 'READING', 'NEEDS_SUPPORT', 'DEVELOPMENT', 'Còn phụ thuộc vào việc dò từng nốt', 'việc đọc còn phụ thuộc vào dò từng nốt', 301),
  ('READING_NEEDS_SLOWER_TEMPO', 'READING', 'DEVELOPING', 'DEVELOPMENT', 'Cần giảm tốc độ để đọc chính xác', 'cần giảm tốc độ để đọc chính xác', 302),
  ('READING_SYMBOL_RECOGNITION', 'READING', 'GUIDED_STABLE', 'STRENGTH', 'Nhận diện đúng các ký hiệu đang học', 'nhận diện đúng các ký hiệu đang học', 303),
  ('READING_PITCH_ACCURATE', 'READING', 'GUIDED_STABLE', 'STRENGTH', 'Đọc cao độ tương đối chính xác', 'đọc cao độ tương đối chính xác', 304),
  ('READING_RHYTHM_ACCURATE', 'READING', 'GUIDED_STABLE', 'STRENGTH', 'Đọc tiết tấu tương đối chính xác', 'đọc tiết tấu tương đối chính xác', 305),
  ('READING_CONTINUOUS_PHRASE', 'READING', 'STABLE', 'STRENGTH', 'Có thể đọc liên tục một câu nhạc ngắn', 'có thể đọc liên tục một câu nhạc ngắn', 306),
  ('READING_RECOVERS_AFTER_ERROR', 'READING', 'STABLE', 'STRENGTH', 'Có thể tiếp tục sau lỗi nhỏ mà không dừng hoàn toàn', 'có thể tiếp tục sau lỗi nhỏ mà không dừng hoàn toàn', 307),
  ('READING_SIGHTREADING_INDEPENDENCE', 'READING', 'INDEPENDENT', 'STRENGTH', 'Khả năng sight-reading ngày càng độc lập', 'khả năng sight-reading ngày càng độc lập', 308),
  ('MUSICALITY_SOUND_UNSTABLE', 'MUSICALITY', 'NEEDS_SUPPORT', 'DEVELOPMENT', 'Chất lượng âm thanh chưa ổn định', 'chất lượng âm thanh chưa ổn định', 401),
  ('MUSICALITY_PHRASING_NEEDS_DEVELOPMENT', 'MUSICALITY', 'DEVELOPING', 'DEVELOPMENT', 'Cần phát triển cách xử lý câu nhạc', 'cách xử lý câu nhạc vẫn cần được phát triển', 402),
  ('MUSICALITY_EXPRESSION_REQUIRES_GUIDANCE', 'MUSICALITY', 'DEVELOPING', 'DEVELOPMENT', 'Biểu cảm còn phụ thuộc nhiều vào hướng dẫn', 'biểu cảm còn phụ thuộc nhiều vào hướng dẫn', 403),
  ('MUSICALITY_SOUND_CONTROL_IMPROVED', 'MUSICALITY', 'GUIDED_STABLE', 'STRENGTH', 'Khả năng kiểm soát âm thanh được cải thiện', 'khả năng kiểm soát âm thanh được cải thiện', 404),
  ('MUSICALITY_DYNAMICS_CLEAR', 'MUSICALITY', 'STABLE', 'STRENGTH', 'Thể hiện tương đối rõ sắc thái/dynamic', 'thể hiện tương đối rõ sắc thái', 405),
  ('MUSICALITY_PHRASING_AWARENESS', 'MUSICALITY', 'STABLE', 'STRENGTH', 'Có ý thức rõ hơn về câu nhạc', 'có ý thức rõ hơn về câu nhạc', 406),
  ('MUSICALITY_ARTICULATION_APPROPRIATE', 'MUSICALITY', 'STABLE', 'STRENGTH', 'Articulation phù hợp hơn với nội dung tác phẩm', 'articulation phù hợp hơn với nội dung tác phẩm', 407),
  ('MUSICALITY_INTERPRETATION_INDEPENDENT', 'MUSICALITY', 'INDEPENDENT', 'STRENGTH', 'Bắt đầu chủ động hơn trong diễn giải âm nhạc', 'bắt đầu chủ động hơn trong diễn giải âm nhạc', 408),
  ('INDEPENDENCE_FREQUENT_PROMPTS', 'INDEPENDENCE', 'NEEDS_SUPPORT', 'DEVELOPMENT', 'Cần giáo viên nhắc thường xuyên', 'vẫn cần giáo viên nhắc thường xuyên', 501),
  ('INDEPENDENCE_RELIES_ON_MODEL', 'INDEPENDENCE', 'DEVELOPING', 'DEVELOPMENT', 'Còn phụ thuộc nhiều vào giáo viên làm mẫu', 'còn phụ thuộc nhiều vào giáo viên làm mẫu', 502),
  ('INDEPENDENCE_AFTER_ONE_EXPLANATION', 'INDEPENDENCE', 'GUIDED_STABLE', 'STRENGTH', 'Có thể thực hiện sau khi được hướng dẫn rõ', 'có thể thực hiện sau khi được hướng dẫn rõ', 503),
  ('INDEPENDENCE_SELF_CORRECT_AFTER_PROMPT', 'INDEPENDENCE', 'GUIDED_STABLE', 'STRENGTH', 'Có thể tự sửa lỗi sau khi được gợi ý', 'có thể tự sửa lỗi sau khi được gợi ý', 504),
  ('INDEPENDENCE_PRACTICE_SEGMENT', 'INDEPENDENCE', 'STABLE', 'STRENGTH', 'Có thể tự luyện một đoạn theo hướng dẫn', 'có thể tự luyện một đoạn theo hướng dẫn', 505),
  ('INDEPENDENCE_PREPARES_ASSIGNMENT', 'INDEPENDENCE', 'STABLE', 'STRENGTH', 'Có thể tự chuẩn bị phần bài đã được giao', 'có thể tự chuẩn bị phần bài đã được giao', 506),
  ('INDEPENDENCE_DETECTS_ERROR', 'INDEPENDENCE', 'STABLE', 'STRENGTH', 'Bắt đầu chủ động nhận ra lỗi trong quá trình thực hiện', 'bắt đầu chủ động nhận ra lỗi trong quá trình thực hiện', 507),
  ('INDEPENDENCE_SELF_LEARNING_EMERGING', 'INDEPENDENCE', 'INDEPENDENT', 'STRENGTH', 'Khả năng tự học đang được hình thành rõ', 'khả năng tự học đang được hình thành rõ', 508),
  ('PRACTICE_ASSIGNMENT_INCOMPLETE', 'PRACTICE_HABIT', 'NEEDS_SUPPORT', 'DEVELOPMENT', 'Chưa hoàn thành đầy đủ bài tập được giao', 'bài tập được giao chưa được hoàn thành đầy đủ', 601),
  ('PRACTICE_INCONSISTENT', 'PRACTICE_HABIT', 'DEVELOPING', 'DEVELOPMENT', 'Việc luyện tập tại nhà chưa đều', 'việc luyện tập tại nhà chưa đều', 602),
  ('PRACTICE_NEEDS_FREQUENCY', 'PRACTICE_HABIT', 'DEVELOPING', 'DEVELOPMENT', 'Cần tăng tần suất luyện tập', 'cần tăng tần suất luyện tập', 603),
  ('PRACTICE_NEEDS_QUALITY_FOCUS', 'PRACTICE_HABIT', 'DEVELOPING', 'DEVELOPMENT', 'Cần chú trọng chất lượng luyện tập hơn thời lượng', 'cần chú trọng chất lượng luyện tập hơn thời lượng', 604),
  ('PRACTICE_PREPARED', 'PRACTICE_HABIT', 'GUIDED_STABLE', 'STRENGTH', 'Chuẩn bị bài tương đối đầy đủ', 'chuẩn bị bài tương đối đầy đủ', 605),
  ('PRACTICE_ASSIGNMENT_COMPLETED', 'PRACTICE_HABIT', 'STABLE', 'STRENGTH', 'Hoàn thành nội dung luyện tập được giao', 'hoàn thành nội dung luyện tập được giao', 606),
  ('PRACTICE_REGULAR', 'PRACTICE_HABIT', 'STABLE', 'STRENGTH', 'Duy trì luyện tập tương đối đều', 'duy trì luyện tập tương đối đều', 607),
  ('PRACTICE_PREPARATION_IMPROVED', 'PRACTICE_HABIT', 'STABLE', 'STRENGTH', 'Chất lượng chuẩn bị bài được cải thiện', 'chất lượng chuẩn bị bài được cải thiện', 608);

create table public.learning_focus_options (
  code text primary key,
  dimension text check (dimension in ('TECHNIQUE','RHYTHM','ACCURACY','READING','MUSICALITY','INDEPENDENCE','PRACTICE_HABIT')),
  label_vi text not null,
  sort_order integer not null unique,
  active boolean not null default true
);
insert into public.learning_focus_options(code, dimension, label_vi, sort_order) values
  ('FOCUS_TECHNIQUE','TECHNIQUE','Kỹ thuật',1),
  ('FOCUS_RHYTHM','RHYTHM','Nhịp',2),
  ('FOCUS_ACCURACY','ACCURACY','Độ chính xác',3),
  ('FOCUS_READING','READING','Đọc nhạc',4),
  ('FOCUS_MUSICALITY','MUSICALITY','Âm thanh / biểu cảm',5),
  ('FOCUS_INDEPENDENCE','INDEPENDENCE','Khả năng tự học',6),
  ('FOCUS_PRACTICE','PRACTICE_HABIT','Thói quen luyện tập',7),
  ('FOCUS_REPERTOIRE',null,'Hoàn thiện tác phẩm',8),
  ('FOCUS_NEW_CONTENT',null,'Nội dung mới',9),
  ('FOCUS_ASSESSMENT',null,'Chuẩn bị assessment',10);

create table public.learning_attention_reasons (
  code text primary key,
  label_vi text not null,
  sort_order integer not null unique,
  active boolean not null default true
);
insert into public.learning_attention_reasons(code, label_vi, sort_order) values
  ('ATTENTION_PROGRESS','Tiến độ cần theo dõi',1),
  ('ATTENTION_PREPARATION','Không chuẩn bị bài nhiều buổi',2),
  ('ATTENTION_TECHNICAL','Khó khăn kỹ thuật kéo dài',3),
  ('ATTENTION_FOCUS','Khả năng tập trung ảnh hưởng việc học',4),
  ('ATTENTION_PRACTICE','Thói quen luyện tập chưa ổn định',5),
  ('ATTENTION_PATHWAY','Cần xem lại lộ trình học',6),
  ('ATTENTION_ACADEMIC_SUPPORT','Cần Academic hỗ trợ',7),
  ('ATTENTION_PARENT_CONTACT','Cần trao đổi với phụ huynh',8);

create table public.learning_homework_parts (
  code text primary key,
  part_group text not null check (part_group in ('CONTENT','METHOD','DURATION','FREQUENCY')),
  label_vi text not null,
  sort_order integer not null,
  active boolean not null default true,
  unique (part_group, sort_order)
);
insert into public.learning_homework_parts(code, part_group, label_vi, sort_order) values
  ('CONTENT_REPERTOIRE','CONTENT','Tác phẩm / repertoire',1),
  ('CONTENT_SCALE','CONTENT','Scale',2),
  ('CONTENT_ARPEGGIO','CONTENT','Arpeggio',3),
  ('CONTENT_ETUDE','CONTENT','Etude',4),
  ('CONTENT_SIGHTREADING','CONTENT','Sight-reading',5),
  ('CONTENT_AURAL','CONTENT','Aural',6),
  ('CONTENT_THEORY','CONTENT','Theory',7),
  ('CONTENT_TECHNIQUE','CONTENT','Bài tập kỹ thuật',8),
  ('CONTENT_PASSAGE','CONTENT','Đoạn khó',9),
  ('CONTENT_OTHER','CONTENT','Nội dung khác',10),
  ('METHOD_SLOW','METHOD','Luyện chậm',1),
  ('METHOD_METRONOME','METHOD','Metronome',2),
  ('METHOD_SECTIONS','METHOD','Chia nhỏ từng đoạn',3),
  ('METHOD_REPEAT','METHOD','Lặp lại đoạn khó',4),
  ('METHOD_SEPARATE','METHOD','Luyện riêng từng phần',5),
  ('METHOD_RECORD','METHOD','Ghi âm và tự nghe',6),
  ('METHOD_SELF_CHECK','METHOD','Tự kiểm tra',7),
  ('DURATION_10','DURATION','10 phút',1),
  ('DURATION_15','DURATION','15 phút',2),
  ('DURATION_20','DURATION','20 phút',3),
  ('DURATION_30','DURATION','30 phút',4),
  ('FREQUENCY_3','FREQUENCY','3 ngày/tuần',1),
  ('FREQUENCY_5','FREQUENCY','5 ngày/tuần',2),
  ('FREQUENCY_DAILY','FREQUENCY','Mỗi ngày',3);

create table public.session_learning_journals (
  id uuid primary key default gen_random_uuid(),
  session_occurrence_id uuid not null unique references public.session_occurrences(id),
  content_covered text not null default '',
  curriculum_context text check (curriculum_context in ('TECHNIQUE','SIGHTREADING','REPERTOIRE','THEORY')),
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED')),
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id),
  revision_count integer not null default 0,
  revised_at timestamptz,
  revised_by uuid references auth.users(id),
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (status <> 'SUBMITTED' or (submitted_at is not null and submitted_by is not null and char_length(btrim(content_covered)) > 0))
);

create table public.student_learning_journal_entries (
  id uuid primary key default gen_random_uuid(),
  session_journal_id uuid not null references public.session_learning_journals(id),
  attendance_record_id uuid not null unique references public.attendance_records(id),
  observation text not null default 'NOT_RECORDED' check (observation in ('NOT_RECORDED','PRACTICING','NEEDS_REVIEW','ACHIEVED')),
  progress_note text not null default '',
  individual_homework text not null default '',
  homework_custom boolean not null default false,
  next_focus_code text references public.learning_focus_options(code),
  attention_required boolean not null default false,
  attention_reason_code text references public.learning_attention_reasons(code),
  attention_detail text not null default '',
  attention_resolved_at timestamptz,
  attention_resolved_by uuid references auth.users(id),
  family_note text not null default '',
  internal_note text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (attention_required or attention_reason_code is null),
  check (char_length(progress_note) <= 4000),
  check (char_length(individual_homework) <= 4000),
  check (char_length(internal_note) <= 4000),
  unique (session_journal_id, attendance_record_id)
);

create table public.student_journal_observation_selections (
  entry_id uuid not null references public.student_learning_journal_entries(id),
  option_code text not null references public.learning_observation_options(code),
  selected_by uuid not null references auth.users(id),
  selected_at timestamptz not null default clock_timestamp(),
  primary key (entry_id, option_code)
);

create function public.guard_learning_taxonomy_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('journal.taxonomy_write', true), '') = 'on' then
    if tg_op = 'DELETE' and tg_table_name = 'student_journal_observation_selections' then return old; end if;
    if tg_op = 'DELETE' then raise exception 'JOURNAL_IMMUTABLE'; end if;
    return new;
  end if;
  raise exception 'JOURNAL_DIRECT_WRITE_DENIED';
end $$;

create trigger session_learning_journals_guard before insert or update or delete on public.session_learning_journals
for each row execute function public.guard_learning_taxonomy_write();
create trigger student_learning_entries_guard before insert or update or delete on public.student_learning_journal_entries
for each row execute function public.guard_learning_taxonomy_write();
create trigger student_journal_selections_guard before insert or update or delete on public.student_journal_observation_selections
for each row execute function public.guard_learning_taxonomy_write();

create function public.session_journal_branch(p_session uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select class_row.branch_id
  from public.session_occurrences occurrence
  join public.schedules schedule on schedule.id = occurrence.schedule_id
  join public.classes class_row on class_row.id = schedule.class_id
  where occurrence.id = p_session
$$;

create function public.can_read_session_journal(p_session uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.account_is_active() and (
    public.has_role('SUPER_ADMIN')
    or public.has_role_permission('BRANCH_ADMIN', 'learning_journals.view', public.session_journal_branch(p_session))
    or public.teacher_can_access_session(p_session)
  )
$$;

create function public.can_write_session_journal(p_session uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.account_is_active() and (
    public.has_role('SUPER_ADMIN')
    or public.teacher_can_access_session(p_session)
  )
$$;

create function public.draft_learning_progress_note(p_codes text[]) returns text
language sql stable set search_path = public, pg_temp as $$
  with picked as (
    select option.signal, option.draft_clause_vi, option.sort_order
    from unnest(coalesce(p_codes, array[]::text[])) as input(code)
    join public.learning_observation_options option on option.code = input.code
  ), parts as (
    select
      (select string_agg(draft_clause_vi, ' và ' order by sort_order) from picked where signal = 'STRENGTH') as strength,
      (select string_agg(draft_clause_vi, '. ' order by sort_order) from picked where signal = 'DEVELOPMENT') as development
  )
  select nullif(btrim(concat_ws(' ',
    case when strength is not null then 'Em ' || strength || '.' end,
    case when development is not null then development || '.' end
  )), '')
  from parts
$$;

create function public.draft_learning_homework(p_codes text[]) returns text
language sql stable set search_path = public, pg_temp as $$
  select nullif(string_agg(part.label_vi, ' · ' order by case part.part_group when 'CONTENT' then 1 when 'METHOD' then 2 when 'DURATION' then 3 else 4 end, part.sort_order), '')
  from unnest(coalesce(p_codes, array[]::text[])) as input(code)
  join public.learning_homework_parts part on part.code = input.code and part.active
$$;

create function public.ensure_session_learning_journal(p_session uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  journal_id uuid;
begin
  if actor is null or not public.can_write_session_journal(p_session) then raise exception 'JOURNAL_UNAUTHORIZED'; end if;
  select id into journal_id from public.session_learning_journals where session_occurrence_id = p_session;
  if found then return journal_id; end if;
  perform set_config('journal.taxonomy_write', 'on', true);
  insert into public.session_learning_journals(session_occurrence_id, created_by)
  values (p_session, actor) returning id into journal_id;
  perform set_config('journal.taxonomy_write', 'off', true);
  return journal_id;
end $$;

create function public.save_session_learning_context(p_session uuid, p_content text, p_context text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  journal_id uuid;
begin
  if p_context is not null and p_context not in ('TECHNIQUE','SIGHTREADING','REPERTOIRE','THEORY') then raise exception 'JOURNAL_CONTEXT_DENIED'; end if;
  journal_id := public.ensure_session_learning_journal(p_session);
  perform set_config('journal.taxonomy_write', 'on', true);
  update public.session_learning_journals set
    content_covered = coalesce(p_content, content_covered),
    curriculum_context = p_context,
    version = version + 1,
    updated_at = clock_timestamp(),
    revision_count = case when status = 'SUBMITTED' then revision_count + 1 else revision_count end,
    revised_at = case when status = 'SUBMITTED' then clock_timestamp() else revised_at end,
    revised_by = case when status = 'SUBMITTED' then actor else revised_by end
  where id = journal_id;
  perform set_config('journal.taxonomy_write', 'off', true);
  return journal_id;
end $$;

create function public.save_student_learning_entry(
  p_attendance uuid,
  p_observation text,
  p_progress_note text,
  p_homework text,
  p_homework_custom boolean,
  p_next_focus text,
  p_attention boolean,
  p_attention_reason text,
  p_attention_detail text,
  p_family_note text,
  p_codes text[]
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  attendance public.attendance_records%rowtype;
  journal_id uuid;
  v_entry uuid;
  v_option text;
begin
  if actor is null or p_observation not in ('NOT_RECORDED','PRACTICING','NEEDS_REVIEW','ACHIEVED') then raise exception 'JOURNAL_INVALID'; end if;
  select * into attendance from public.attendance_records where id = p_attendance;
  if not found then raise exception 'JOURNAL_ATTENDANCE_MISSING'; end if;
  if not public.can_write_session_journal(attendance.session_occurrence_id) then raise exception 'JOURNAL_UNAUTHORIZED'; end if;
  if attendance.status in ('ABSENT','EXCUSED') and (
    coalesce(array_length(p_codes, 1), 0) > 0
    or p_observation <> 'NOT_RECORDED'
    or nullif(btrim(coalesce(p_progress_note, '')), '') is not null
  ) then
    raise exception 'JOURNAL_ABSENT_OBSERVATION_DENIED';
  end if;
  if coalesce(p_attention, false) and p_attention_reason is not null and not exists(
    select 1 from public.learning_attention_reasons reason where reason.code = p_attention_reason and reason.active
  ) then raise exception 'JOURNAL_ATTENTION_DENIED'; end if;
  if p_next_focus is not null and not exists(select 1 from public.learning_focus_options focus where focus.code = p_next_focus and focus.active) then
    raise exception 'JOURNAL_FOCUS_DENIED';
  end if;
  journal_id := public.ensure_session_learning_journal(attendance.session_occurrence_id);
  perform set_config('journal.taxonomy_write', 'on', true);
  insert into public.student_learning_journal_entries(session_journal_id, attendance_record_id, observation, progress_note, individual_homework, homework_custom, next_focus_code, attention_required, attention_reason_code, attention_detail, family_note)
  values (journal_id, attendance.id, p_observation, coalesce(p_progress_note, ''), coalesce(p_homework, ''), coalesce(p_homework_custom, false), p_next_focus, coalesce(p_attention, false), case when coalesce(p_attention, false) then p_attention_reason else null end, coalesce(p_attention_detail, ''), coalesce(p_family_note, ''))
  on conflict (attendance_record_id) do update set
    observation = excluded.observation,
    progress_note = excluded.progress_note,
    individual_homework = excluded.individual_homework,
    homework_custom = excluded.homework_custom,
    next_focus_code = excluded.next_focus_code,
    attention_required = excluded.attention_required,
    attention_reason_code = excluded.attention_reason_code,
    attention_detail = excluded.attention_detail,
    family_note = excluded.family_note,
    version = student_learning_journal_entries.version + 1,
    updated_at = clock_timestamp()
  returning id into v_entry;
  delete from public.student_journal_observation_selections selection where selection.entry_id = v_entry;
  if attendance.status in ('PRESENT','LATE') then
    foreach v_option in array coalesce(p_codes, array[]::text[]) loop
      if not exists(select 1 from public.learning_observation_options option where option.code = v_option and option.active) then
        raise exception 'JOURNAL_OPTION_INACTIVE';
      end if;
      insert into public.student_journal_observation_selections(entry_id, option_code, selected_by) values (v_entry, v_option, actor);
    end loop;
  end if;
  perform set_config('journal.taxonomy_write', 'off', true);
  return v_entry;
end $$;

create function public.select_journal_observation(p_entry uuid, p_code text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  entry public.student_learning_journal_entries%rowtype;
  attendance_status text;
  session_id uuid;
begin
  if actor is null or p_code is null then raise exception 'JOURNAL_INVALID'; end if;
  select * into entry from public.student_learning_journal_entries where id = p_entry;
  if not found then raise exception 'JOURNAL_ENTRY_MISSING'; end if;
  select attendance.status, attendance.session_occurrence_id into attendance_status, session_id
  from public.attendance_records attendance where attendance.id = entry.attendance_record_id;
  if not public.can_write_session_journal(session_id) then raise exception 'JOURNAL_UNAUTHORIZED'; end if;
  if attendance_status in ('ABSENT','EXCUSED') then raise exception 'JOURNAL_ABSENT_OBSERVATION_DENIED'; end if;
  if not exists(select 1 from public.learning_observation_options option where option.code = p_code and option.active) then
    raise exception 'JOURNAL_OPTION_INACTIVE';
  end if;
  perform set_config('journal.taxonomy_write', 'on', true);
  insert into public.student_journal_observation_selections(entry_id, option_code, selected_by) values (entry.id, p_code, actor);
  perform set_config('journal.taxonomy_write', 'off', true);
  return entry.id;
end $$;

create function public.apply_shared_journal_practice(p_session uuid, p_homework text, p_focus text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  updated_count integer;
begin
  if not public.can_write_session_journal(p_session) then raise exception 'JOURNAL_UNAUTHORIZED'; end if;
  if p_focus is not null and not exists(select 1 from public.learning_focus_options focus where focus.code = p_focus and focus.active) then
    raise exception 'JOURNAL_FOCUS_DENIED';
  end if;
  perform public.ensure_session_learning_journal(p_session);
  perform set_config('journal.taxonomy_write', 'on', true);
  insert into public.student_learning_journal_entries(session_journal_id, attendance_record_id, individual_homework, next_focus_code)
  select journal.id, attendance.id, coalesce(p_homework, ''), p_focus
  from public.session_learning_journals journal
  join public.attendance_records attendance on attendance.session_occurrence_id = journal.session_occurrence_id
  where journal.session_occurrence_id = p_session
    and attendance.status in ('PRESENT','LATE')
    and not exists(select 1 from public.student_learning_journal_entries existing where existing.attendance_record_id = attendance.id);
  update public.student_learning_journal_entries entry set
    individual_homework = coalesce(p_homework, entry.individual_homework),
    next_focus_code = coalesce(p_focus, entry.next_focus_code),
    version = entry.version + 1,
    updated_at = clock_timestamp()
  from public.attendance_records attendance, public.session_learning_journals journal
  where entry.attendance_record_id = attendance.id
    and entry.session_journal_id = journal.id
    and journal.session_occurrence_id = p_session
    and attendance.status in ('PRESENT','LATE')
    and not entry.homework_custom;
  get diagnostics updated_count = row_count;
  perform set_config('journal.taxonomy_write', 'off', true);
  return updated_count;
end $$;

create function public.submit_session_learning_journal(p_session uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  journal public.session_learning_journals%rowtype;
begin
  if actor is null or not public.can_write_session_journal(p_session) then raise exception 'JOURNAL_UNAUTHORIZED'; end if;
  select * into journal from public.session_learning_journals where session_occurrence_id = p_session for update;
  if not found then raise exception 'JOURNAL_SESSION_MISSING'; end if;
  if nullif(btrim(journal.content_covered), '') is null then raise exception 'JOURNAL_CONTENT_REQUIRED'; end if;
  if exists(
    select 1
    from public.attendance_records attendance
    left join public.student_learning_journal_entries entry on entry.attendance_record_id = attendance.id
    where attendance.session_occurrence_id = p_session
      and attendance.status in ('PRESENT','LATE')
      and (entry.id is null or nullif(btrim(entry.progress_note), '') is null or entry.observation = 'NOT_RECORDED')
  ) then
    raise exception 'JOURNAL_PROGRESS_REQUIRED';
  end if;
  perform set_config('journal.taxonomy_write', 'on', true);
  update public.session_learning_journals set
    status = 'SUBMITTED',
    submitted_at = coalesce(submitted_at, clock_timestamp()),
    submitted_by = coalesce(submitted_by, actor),
    version = version + 1,
    updated_at = clock_timestamp()
  where id = journal.id;
  perform set_config('journal.taxonomy_write', 'off', true);
  return journal.id;
end $$;

create function public.aggregate_student_learning_observations(p_student uuid, p_from date, p_to date)
returns table (
  dimension text,
  observation_code text,
  development_level text,
  signal text,
  observation_count integer,
  first_observed_on date,
  latest_observed_on date,
  curriculum_context text,
  next_focus_code text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select option.dimension, option.code, option.development_level, option.signal,
    count(*)::integer,
    min(occurrence.occurrence_date),
    max(occurrence.occurrence_date),
    (array_agg(journal.curriculum_context order by occurrence.occurrence_date desc))[1],
    (array_agg(entry.next_focus_code order by occurrence.occurrence_date desc))[1]
  from public.student_journal_observation_selections selection
  join public.student_learning_journal_entries entry on entry.id = selection.entry_id
  join public.session_learning_journals journal on journal.id = entry.session_journal_id
  join public.attendance_records attendance on attendance.id = entry.attendance_record_id
  join public.enrollments enrollment on enrollment.id = attendance.enrollment_id
  join public.session_occurrences occurrence on occurrence.id = attendance.session_occurrence_id
  join public.learning_observation_options option on option.code = selection.option_code
  where enrollment.student_id = p_student
    and journal.status = 'SUBMITTED'
    and public.can_read_session_journal(occurrence.id)
    and (p_from is null or occurrence.occurrence_date >= p_from)
    and (p_to is null or occurrence.occurrence_date <= p_to)
  group by option.dimension, option.code, option.development_level, option.signal
  order by count(*) desc, option.code
$$;

alter table public.learning_observation_options enable row level security;
alter table public.learning_focus_options enable row level security;
alter table public.learning_attention_reasons enable row level security;
alter table public.learning_homework_parts enable row level security;
alter table public.session_learning_journals enable row level security;
alter table public.student_learning_journal_entries enable row level security;
alter table public.student_journal_observation_selections enable row level security;

create policy learning_observation_options_read on public.learning_observation_options
for select to authenticated using (public.account_is_active() and (public.has_role('SUPER_ADMIN') or public.has_role('TEACHER') or public.has_role('BRANCH_ADMIN')));
create policy learning_focus_read on public.learning_focus_options
for select to authenticated using (public.account_is_active() and (public.has_role('SUPER_ADMIN') or public.has_role('TEACHER') or public.has_role('BRANCH_ADMIN')));
create policy learning_attention_read on public.learning_attention_reasons
for select to authenticated using (public.account_is_active() and (public.has_role('SUPER_ADMIN') or public.has_role('TEACHER') or public.has_role('BRANCH_ADMIN')));
create policy learning_homework_read on public.learning_homework_parts
for select to authenticated using (public.account_is_active() and (public.has_role('SUPER_ADMIN') or public.has_role('TEACHER') or public.has_role('BRANCH_ADMIN')));
create policy session_learning_journals_read on public.session_learning_journals
for select to authenticated using (public.can_read_session_journal(session_occurrence_id));
create policy student_learning_entries_read on public.student_learning_journal_entries
for select to authenticated using (
  exists(select 1 from public.session_learning_journals journal
    where journal.id = session_journal_id and public.can_read_session_journal(journal.session_occurrence_id))
);
create policy student_journal_selections_read on public.student_journal_observation_selections
for select to authenticated using (
  exists(
    select 1 from public.student_learning_journal_entries entry
    join public.session_learning_journals journal on journal.id = entry.session_journal_id
    where entry.id = entry_id and public.can_read_session_journal(journal.session_occurrence_id)
  )
);

revoke all on public.learning_observation_options, public.learning_focus_options, public.learning_attention_reasons, public.learning_homework_parts,
  public.session_learning_journals, public.student_learning_journal_entries, public.student_journal_observation_selections
from public, anon, authenticated, service_role;
grant select on public.learning_observation_options, public.learning_focus_options, public.learning_attention_reasons, public.learning_homework_parts,
  public.session_learning_journals, public.student_learning_journal_entries, public.student_journal_observation_selections
to authenticated;

revoke all on function
  public.guard_learning_taxonomy_write(),
  public.session_journal_branch(uuid),
  public.can_read_session_journal(uuid),
  public.can_write_session_journal(uuid),
  public.draft_learning_progress_note(text[]),
  public.draft_learning_homework(text[]),
  public.ensure_session_learning_journal(uuid),
  public.save_session_learning_context(uuid, text, text),
  public.save_student_learning_entry(uuid, text, text, text, boolean, text, boolean, text, text, text, text[]),
  public.select_journal_observation(uuid, text),
  public.apply_shared_journal_practice(uuid, text, text),
  public.submit_session_learning_journal(uuid),
  public.aggregate_student_learning_observations(uuid, date, date)
from public, anon, authenticated, service_role;
grant execute on function
  public.can_read_session_journal(uuid),
  public.draft_learning_progress_note(text[]),
  public.draft_learning_homework(text[]),
  public.ensure_session_learning_journal(uuid),
  public.save_session_learning_context(uuid, text, text),
  public.save_student_learning_entry(uuid, text, text, text, boolean, text, boolean, text, text, text, text[]),
  public.select_journal_observation(uuid, text),
  public.apply_shared_journal_practice(uuid, text, text),
  public.submit_session_learning_journal(uuid),
  public.aggregate_student_learning_observations(uuid, date, date)
to authenticated;
