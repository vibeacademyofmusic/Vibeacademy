-- Approved Contents metadata only; no instructional content or publication.
create table public.learning_theory_contents (
 code text primary key,grade integer not null check(grade between 1 and 5),sequence_no integer not null,
 title text not null,source_pages text not null,source_state text not null check(source_state in('SCOPE_REFERENCE_ONLY','SOURCE_MISSING')),
 unique(grade,sequence_no)
);
insert into public.learning_theory_contents(code,grade,sequence_no,title,source_pages,source_state) values
('MT1.01',1,1,'Time Names and Time Values','pp. 4-5','SCOPE_REFERENCE_ONLY'),
('MT1.02',1,2,'Bar-lines and Time Signatures','pp. 6-8','SCOPE_REFERENCE_ONLY'),
('MT1.03',1,3,'Writing on a Stave','pp. 9-9','SCOPE_REFERENCE_ONLY'),
('MT1.04',1,4,'Letter Names','pp. 10-15','SCOPE_REFERENCE_ONLY'),
('MT1.05',1,5,'Semiquavers','pp. 16-17','SCOPE_REFERENCE_ONLY'),
('MT1.06',1,6,'Rests','pp. 18-19','SCOPE_REFERENCE_ONLY'),
('MT1.07',1,7,'Ties and Slurs','pp. 20-21','SCOPE_REFERENCE_ONLY'),
('MT1.08',1,8,'Dotted Notes','pp. 22-25','SCOPE_REFERENCE_ONLY'),
('MT1.09',1,9,'Accidentals','pp. 26-27','SCOPE_REFERENCE_ONLY'),
('MT1.10',1,10,'Semitones and Tones','pp. 28-29','SCOPE_REFERENCE_ONLY'),
('MT1.11',1,11,'Scales and Key Signatures of C, G, D and F Major','pp. 30-37','SCOPE_REFERENCE_ONLY'),
('MT1.12',1,12,'Degrees of the Scale','pp. 38-39','SCOPE_REFERENCE_ONLY'),
('MT1.13',1,13,'Intervals','pp. 40-41','SCOPE_REFERENCE_ONLY'),
('MT1.14',1,14,'Tonic Triads','pp. 42-43','SCOPE_REFERENCE_ONLY'),
('MT1.15',1,15,'Cancelling an Accidental','pp. 44-44','SCOPE_REFERENCE_ONLY'),
('MT1.16',1,16,'Upbeats','pp. 45-45','SCOPE_REFERENCE_ONLY'),
('MT1.17',1,17,'The Grouping of Notes','pp. 46-51','SCOPE_REFERENCE_ONLY'),
('MT1.18',1,18,'Composing an Answering Rhythm','pp. 52-53','SCOPE_REFERENCE_ONLY'),
('MT1.19',1,19,'Performance Directions','pp. 54-55','SCOPE_REFERENCE_ONLY'),
('MT1.20',1,20,'General Exercises','pp. 56-58','SCOPE_REFERENCE_ONLY'),
('MT1.21',1,21,'Specimen Test Grade 1','pp. 59-61','SCOPE_REFERENCE_ONLY'),
('MT1.22',1,22,'Revision Notes','pp. 62-64','SCOPE_REFERENCE_ONLY'),
('MT2.01',2,1,'Ledger Lines','pp. 4-8','SCOPE_REFERENCE_ONLY'),
('MT2.02',2,2,'Time Names and Time Values','pp. 9-10','SCOPE_REFERENCE_ONLY'),
('MT2.03',2,3,'Time Signatures','pp. 11-15','SCOPE_REFERENCE_ONLY'),
('MT2.04',2,4,'Triplets','pp. 16-18','SCOPE_REFERENCE_ONLY'),
('MT2.05',2,5,'Grouping of Notes','pp. 19-22','SCOPE_REFERENCE_ONLY'),
('MT2.06',2,6,'Grouping of Rests','pp. 23-28','SCOPE_REFERENCE_ONLY'),
('MT2.07',2,7,'Scales and Key Signatures of A, B-flat and E-flat Major','pp. 29-36','SCOPE_REFERENCE_ONLY'),
('MT2.08',2,8,'Scales and Key Signatures of A, E and D Minor','pp. 37-42','SCOPE_REFERENCE_ONLY'),
('MT2.09',2,9,'Tonic Triads','pp. 43-45','SCOPE_REFERENCE_ONLY'),
('MT2.10',2,10,'Degrees of the Scale','pp. 46-47','SCOPE_REFERENCE_ONLY'),
('MT2.11',2,11,'Intervals','pp. 48-49','SCOPE_REFERENCE_ONLY'),
('MT2.12',2,12,'Composing Four-Bar Rhythms','pp. 50-52','SCOPE_REFERENCE_ONLY'),
('MT2.13',2,13,'Performance Directions','pp. 53-55','SCOPE_REFERENCE_ONLY'),
('MT2.14',2,14,'General Exercises','pp. 56-58','SCOPE_REFERENCE_ONLY'),
('MT2.15',2,15,'Specimen Test Grade 2','pp. 59-61','SCOPE_REFERENCE_ONLY'),
('MT2.16',2,16,'Revision Notes','pp. 62-64','SCOPE_REFERENCE_ONLY'),
('MT3.01',3,1,'Time Names and Time Values','pp. 4-11','SCOPE_REFERENCE_ONLY'),
('MT3.02',3,2,'Ledger Lines','pp. 12-15','SCOPE_REFERENCE_ONLY'),
('MT3.03',3,3,'Transposition','pp. 16-17','SCOPE_REFERENCE_ONLY'),
('MT3.04',3,4,'Simple and Compound Time','pp. 18-22','SCOPE_REFERENCE_ONLY'),
('MT3.05',3,5,'Grouping of Notes','pp. 23-24','SCOPE_REFERENCE_ONLY'),
('MT3.06',3,6,'Grouping of Rests','pp. 25-27','SCOPE_REFERENCE_ONLY'),
('MT3.07',3,7,'Deliberate Mistakes','pp. 28-29','SCOPE_REFERENCE_ONLY'),
('MT3.08',3,8,'Scales and Key Signatures of E and A-flat Major','pp. 30-34','SCOPE_REFERENCE_ONLY'),
('MT3.09',3,9,'Scales and Key Signatures of B, F-sharp, C-sharp, G, C and F Minor','pp. 35-42','SCOPE_REFERENCE_ONLY'),
('MT3.10',3,10,'Tonic Triads','pp. 43-45','SCOPE_REFERENCE_ONLY'),
('MT3.11',3,11,'Intervals','pp. 46-47','SCOPE_REFERENCE_ONLY'),
('MT3.12',3,12,'Four-Bar Rhythms','pp. 48-50','SCOPE_REFERENCE_ONLY'),
('MT3.13',3,13,'Simple Phrase Structure','pp. 51-52','SCOPE_REFERENCE_ONLY'),
('MT3.14',3,14,'Performance Directions','pp. 53-55','SCOPE_REFERENCE_ONLY'),
('MT3.15',3,15,'General Exercises','pp. 56-58','SCOPE_REFERENCE_ONLY'),
('MT3.16',3,16,'Specimen Test Grade 3','pp. 59-61','SCOPE_REFERENCE_ONLY'),
('MT3.17',3,17,'Revision Notes','pp. 62-64','SCOPE_REFERENCE_ONLY'),
('MT4.01',4,1,'Alto Clef','pp. 4-7','SCOPE_REFERENCE_ONLY'),
('MT4.02',4,2,'Breves, Double Dots and Duplets','pp. 8-10','SCOPE_REFERENCE_ONLY'),
('MT4.03',4,3,'Time Signatures','pp. 11-19','SCOPE_REFERENCE_ONLY'),
('MT4.04',4,4,'Four-Bar Rhythms','pp. 20-21','SCOPE_REFERENCE_ONLY'),
('MT4.05',4,5,'Double Sharps, Double Flats and Enharmonic Equivalents','pp. 22-23','SCOPE_REFERENCE_ONLY'),
('MT4.06',4,6,'Scales with Five Sharps and Five Flats','pp. 24-31','SCOPE_REFERENCE_ONLY'),
('MT4.07',4,7,'Technical Names of Notes','pp. 32-33','SCOPE_REFERENCE_ONLY'),
('MT4.08',4,8,'Triads and Chords on I, IV and V','pp. 34-37','SCOPE_REFERENCE_ONLY'),
('MT4.09',4,9,'Intervals','pp. 38-41','SCOPE_REFERENCE_ONLY'),
('MT4.10',4,10,'Chromatic Scale','pp. 42-45','SCOPE_REFERENCE_ONLY'),
('MT4.11',4,11,'Ornaments','pp. 46-47','SCOPE_REFERENCE_ONLY'),
('MT4.12',4,12,'Writing a Rhythm to Words','pp. 48-51','SCOPE_REFERENCE_ONLY'),
('MT4.13',4,13,'Instruments','pp. 52-57','SCOPE_REFERENCE_ONLY'),
('MT4.14',4,14,'Performance Directions','pp. 58-61','SCOPE_REFERENCE_ONLY'),
('MT4.15',4,15,'General Exercises','pp. 62-64','SCOPE_REFERENCE_ONLY'),
('MT4.16',4,16,'Specimen Test Grade 4','pp. 65-69','SCOPE_REFERENCE_ONLY'),
('MT4.17',4,17,'Revision Notes','pp. 70-70','SCOPE_REFERENCE_ONLY'),
('MT5.01',5,1,'Tenor Clef','pp. 4-8','SCOPE_REFERENCE_ONLY'),
('MT5.02',5,2,'Irregular Time Signatures','pp. 9-11','SCOPE_REFERENCE_ONLY'),
('MT5.03',5,3,'Scales with Six Sharps and Six Flats','pp. 12-21','SCOPE_REFERENCE_ONLY'),
('MT5.04',5,4,'Transposition','pp. 22-31','SCOPE_REFERENCE_ONLY'),
('MT5.05',5,5,'SATB in Short and Open Score','pp. 32-35','SCOPE_REFERENCE_ONLY'),
('MT5.06',5,6,'Irregular Time Divisions','pp. 36-38','SCOPE_REFERENCE_ONLY'),
('MT5.07',5,7,'Intervals','pp. 39-42','SCOPE_REFERENCE_ONLY'),
('MT5.08',5,8,'Identifying Chords','pp. 43-45','SCOPE_REFERENCE_ONLY'),
('MT5.09',5,9,'Chords at Cadence Points','pp. 46-48','SCOPE_REFERENCE_ONLY'),
('MT5.10',5,10,'Composing Melodies','pp. 49-61','SCOPE_REFERENCE_ONLY'),
('MT5.11',5,11,'Ornaments and Repetitions','pp. 62-65','SCOPE_REFERENCE_ONLY'),
('MT5.12',5,12,'Instruments','pp. 66-74','SCOPE_REFERENCE_ONLY'),
('MT5.13',5,13,'Performance Directions','pp. 75-79','SCOPE_REFERENCE_ONLY'),
('MT5.14',5,14,'Grade 5 Specimen Test','pp. 80-85','SCOPE_REFERENCE_ONLY'),
('MT5.15',5,15,'Revision Notes','p. 86 (SOURCE_MISSING)','SOURCE_MISSING');
alter table public.learning_theory_contents enable row level security;
revoke all on public.learning_theory_contents from public,anon,authenticated,service_role;
grant select on public.learning_theory_contents to authenticated;
create policy learning_theory_catalogue_admin on public.learning_theory_contents for select to authenticated using(public.has_role('SUPER_ADMIN'));
create trigger learning_theory_catalogue_immutable before update or delete on public.learning_theory_contents for each row execute function public.reject_learning_history_mutation();

create function public.guard_learning_theory_contents() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare m jsonb;lesson jsonb;reference public.learning_theory_contents;grade integer;last_sequence integer:=0;level_number integer;
begin
 perform public.validate_learning_content(new.content);
 if new.content ? 'theory_grade' or exists(select 1 from jsonb_array_elements(new.content->'modules') item where item->>'code' like 'MT%') then
 if jsonb_typeof(new.content->'theory_grade') is distinct from 'number' or new.content->>'theory_grade' !~ '^[1-5]$' or new.content->>'source_sha256' is distinct from '474b61c92c47208d944fc23b8137372ef074af6594ebac24b3b4f375269ba4a6' then raise exception 'Theory source identity required';end if;
 grade:=(new.content->>'theory_grade')::integer;
 select l.level_number into level_number from public.curriculum_levels l join public.curriculums c on c.id=l.curriculum_id where l.id=new.level_id and l.level_type='GRADE' and l.status='ACTIVE' and c.status='ACTIVE';
 if level_number is distinct from grade then raise exception 'Theory Grade must match active Academic Grade number';end if;
 for m in select value from jsonb_array_elements(new.content->'modules') loop
 select * into reference from public.learning_theory_contents where code=m->>'code';
 if not found or reference.grade<>grade or reference.sequence_no<=last_sequence or m->>'title' is distinct from reference.title or m->>'source_pages' is distinct from reference.source_pages then raise exception 'Theory modules must follow approved Contents identity and order';end if;
 if reference.source_state='SOURCE_MISSING' then raise exception 'SOURCE_MISSING: module cannot contain authored lessons';end if;
 last_sequence:=reference.sequence_no;
 for lesson in select value from jsonb_array_elements(m->'lessons') loop
 if left(lesson->>'code',length(reference.code)+2) is distinct from reference.code||'.L' then raise exception 'Theory lesson must belong to its Contents module';end if;
 end loop;
 end loop;
 end if;
 return new;
end$$;
revoke all on function public.guard_learning_theory_contents() from public,anon,authenticated,service_role;
create trigger learning_theory_contract before insert on public.learning_versions for each row execute function public.guard_learning_theory_contents();
