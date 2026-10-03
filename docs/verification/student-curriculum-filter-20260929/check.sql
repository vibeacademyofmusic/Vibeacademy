BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM auth.users WHERE email='admin@vibe.local'),true);
DO $$ DECLARE c uuid; expected integer; actual integer; BEGIN
IF (SELECT count(*) FROM public.list_current_student_enrollments(null,null)) <> public.count_current_student_enrollments_by_curriculum(null,null) THEN RAISE EXCEPTION 'unfiltered mismatch current'; END IF;
FOR c IN SELECT id FROM public.curriculums LOOP
SELECT count(*) INTO expected FROM public.list_current_student_enrollments(null,null) r JOIN public.classes cl ON cl.id=r.class_id JOIN public.courses co ON co.id=cl.course_id WHERE co.curriculum_id=c;
actual:=public.count_current_student_enrollments_by_curriculum(c,null);
IF expected<>actual THEN RAISE EXCEPTION 'curriculum mismatch current'; END IF;
IF (SELECT count(*) FROM public.list_current_student_enrollments_by_curriculum(c,null,null,1,0))<>least(actual,1) THEN RAISE EXCEPTION 'pagination mismatch'; END IF;
END LOOP;
RAISE NOTICE 'PASS: current unfiltered equivalence, curriculum filtering, pagination'; END $$;
DO $$ DECLARE c uuid; expected integer; actual integer; BEGIN
IF (SELECT count(*) FROM public.list_paused_student_enrollments(null,null)) <> public.count_paused_student_enrollments_by_curriculum(null,null) THEN RAISE EXCEPTION 'unfiltered mismatch paused'; END IF;
FOR c IN SELECT id FROM public.curriculums LOOP
SELECT count(*) INTO expected FROM public.list_paused_student_enrollments(null,null) r JOIN public.classes cl ON cl.id=r.class_id JOIN public.courses co ON co.id=cl.course_id WHERE co.curriculum_id=c;
actual:=public.count_paused_student_enrollments_by_curriculum(c,null);
IF expected<>actual THEN RAISE EXCEPTION 'curriculum mismatch paused'; END IF;
IF (SELECT count(*) FROM public.list_paused_student_enrollments_by_curriculum(c,null,null,1,0))<>least(actual,1) THEN RAISE EXCEPTION 'pagination mismatch'; END IF;
END LOOP;
RAISE NOTICE 'PASS: paused unfiltered equivalence, curriculum filtering, pagination'; END $$;
DO $$ DECLARE c uuid; expected integer; actual integer; BEGIN
IF (SELECT count(*) FROM public.list_waiting_placements(null,'ALL',null)) <> public.count_waiting_placements_by_curriculum(null,null,'ALL',null) THEN RAISE EXCEPTION 'unfiltered mismatch waiting'; END IF;
FOR c IN SELECT id FROM public.curriculums LOOP
SELECT count(*) INTO expected FROM public.list_waiting_placements(null,'ALL',null) r JOIN public.student_placement_cases pc ON pc.id=r.placement_id JOIN public.registration_applications a ON a.id=pc.registration_application_id LEFT JOIN public.courses co ON co.id=r.course_id WHERE coalesce(a.curriculum_id,co.curriculum_id)=c;
actual:=public.count_waiting_placements_by_curriculum(c,null,'ALL',null);
IF expected<>actual THEN RAISE EXCEPTION 'curriculum mismatch waiting'; END IF;
IF (SELECT count(*) FROM public.list_waiting_placements_by_curriculum(c,null,'ALL',null,1,0))<>least(actual,1) THEN RAISE EXCEPTION 'pagination mismatch'; END IF;
END LOOP;
RAISE NOTICE 'PASS: waiting unfiltered equivalence, curriculum filtering, pagination'; END $$;
DO $$ DECLARE c uuid; expected integer; actual integer; BEGIN
IF (SELECT count(*) FROM public.list_future_start_placements(null,'ALL',null)) <> public.count_future_start_placements_by_curriculum(null,null,null) THEN RAISE EXCEPTION 'unfiltered mismatch future_start'; END IF;
FOR c IN SELECT id FROM public.curriculums LOOP
SELECT count(*) INTO expected FROM public.list_future_start_placements(null,'ALL',null) r JOIN public.student_placement_cases pc ON pc.id=r.placement_id JOIN public.registration_applications a ON a.id=pc.registration_application_id LEFT JOIN public.courses co ON co.id=r.course_id WHERE coalesce(a.curriculum_id,co.curriculum_id)=c;
actual:=public.count_future_start_placements_by_curriculum(c,null,null);
IF expected<>actual THEN RAISE EXCEPTION 'curriculum mismatch future_start'; END IF;
IF (SELECT count(*) FROM public.list_future_start_placements_by_curriculum(c,null,'ALL',null,1,0))<>least(actual,1) THEN RAISE EXCEPTION 'pagination mismatch'; END IF;
END LOOP;
RAISE NOTICE 'PASS: future_start unfiltered equivalence, curriculum filtering, pagination'; END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000000',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.list_current_student_enrollments_by_curriculum(null,null,null)) THEN RAISE EXCEPTION 'unauthorized results'; END IF; RAISE NOTICE 'PASS: unauthorized current_student_enrollments empty'; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.list_paused_student_enrollments_by_curriculum(null,null,null)) THEN RAISE EXCEPTION 'unauthorized results'; END IF; RAISE NOTICE 'PASS: unauthorized paused_student_enrollments empty'; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.list_waiting_placements_by_curriculum(null,null,'ALL',null)) THEN RAISE EXCEPTION 'unauthorized results'; END IF; RAISE NOTICE 'PASS: unauthorized waiting_placements empty'; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.list_future_start_placements_by_curriculum(null,null,'ALL',null)) THEN RAISE EXCEPTION 'unauthorized results'; END IF; RAISE NOTICE 'PASS: unauthorized future_start_placements empty'; END $$;
ROLLBACK;
