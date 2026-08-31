


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."has_role"("role_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r
      on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.code = role_code
  );
$$;


ALTER FUNCTION "public"."has_role"("role_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "phone" "text",
    "timezone" "text" DEFAULT 'Asia/Ho_Chi_Minh'::"text" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "branches_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'INACTIVE'::"text"])))
);


ALTER TABLE "public"."branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curriculum_levels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "curriculum_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "sequence_no" integer NOT NULL,
    "level_number" integer,
    "level_type" "text" DEFAULT 'GRADE'::"text" NOT NULL,
    "completion_rule" "text" DEFAULT 'ALL_REQUIRED_SUBJECTS'::"text" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "curriculum_levels_completion_rule_check" CHECK (("completion_rule" = ANY (ARRAY['ALL_REQUIRED_SUBJECTS'::"text", 'MANUAL'::"text"]))),
    CONSTRAINT "curriculum_levels_level_type_check" CHECK (("level_type" = ANY (ARRAY['FOUNDATION'::"text", 'GRADE'::"text", 'DIPLOMA'::"text", 'OTHER'::"text"]))),
    CONSTRAINT "curriculum_levels_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'INACTIVE'::"text"])))
);


ALTER TABLE "public"."curriculum_levels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curriculum_subject_components" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_required" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "curriculum_subject_components_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'INACTIVE'::"text"])))
);


ALTER TABLE "public"."curriculum_subject_components" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curriculum_subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "level_id" "uuid" NOT NULL,
    "family_code" "text" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "subject_level" integer,
    "is_required" boolean DEFAULT true NOT NULL,
    "completion_rule" "text" DEFAULT 'ALL_REQUIRED_COMPONENTS'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "curriculum_subjects_completion_rule_check" CHECK (("completion_rule" = ANY (ARRAY['ALL_REQUIRED_COMPONENTS'::"text", 'DIRECT_ASSESSMENT'::"text", 'MANUAL'::"text"]))),
    CONSTRAINT "curriculum_subjects_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'INACTIVE'::"text"])))
);


ALTER TABLE "public"."curriculum_subjects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curriculums" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "curriculums_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'INACTIVE'::"text"])))
);


ALTER TABLE "public"."curriculums" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "parent_code" "text",
    "occupation" "text",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parents_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'INACTIVE'::"text"])))
);


ALTER TABLE "public"."parents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "module" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "avatar_url" "text",
    "date_of_birth" "date",
    "gender" "text",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'INACTIVE'::"text", 'SUSPENDED'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_system" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_component_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_progress_id" "uuid" NOT NULL,
    "component_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'NOT_STARTED'::"text" NOT NULL,
    "score" numeric(6,2),
    "started_at" timestamp with time zone,
    "passed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_component_progress_status_check" CHECK (("status" = ANY (ARRAY['NOT_STARTED'::"text", 'IN_PROGRESS'::"text", 'PASS'::"text", 'NOT_PASSED'::"text", 'EXEMPT'::"text"])))
);


ALTER TABLE "public"."student_component_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_curriculum_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "curriculum_id" "uuid" NOT NULL,
    "current_level_id" "uuid",
    "is_primary" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "started_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "completed_at" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_curriculum_enrollments_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'PAUSED'::"text", 'COMPLETED'::"text", 'WITHDRAWN'::"text"])))
);


ALTER TABLE "public"."student_curriculum_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_level_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "enrollment_id" "uuid" NOT NULL,
    "level_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'LOCKED'::"text" NOT NULL,
    "unlocked_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_level_progress_status_check" CHECK (("status" = ANY (ARRAY['LOCKED'::"text", 'AVAILABLE'::"text", 'IN_PROGRESS'::"text", 'COMPLETED'::"text"])))
);


ALTER TABLE "public"."student_level_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_parents" (
    "student_id" "uuid" NOT NULL,
    "parent_id" "uuid" NOT NULL,
    "relationship" "text",
    "is_primary" boolean DEFAULT false NOT NULL,
    "can_view_finance" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."student_parents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_subject_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "level_progress_id" "uuid" NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'NOT_STARTED'::"text" NOT NULL,
    "score" numeric(6,2),
    "started_at" timestamp with time zone,
    "passed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_subject_progress_status_check" CHECK (("status" = ANY (ARRAY['NOT_STARTED'::"text", 'IN_PROGRESS'::"text", 'PASS'::"text", 'NOT_PASSED'::"text", 'EXEMPT'::"text"])))
);


ALTER TABLE "public"."student_subject_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "student_code" "text" NOT NULL,
    "default_branch_id" "uuid",
    "admission_date" "date",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "full_name" "text",
    "preferred_name" "text",
    "date_of_birth" "date",
    "gender" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "notes" "text",
    CONSTRAINT "students_gender_check" CHECK ((("gender" IS NULL) OR ("gender" = ANY (ARRAY['MALE'::"text", 'FEMALE'::"text", 'OTHER'::"text", 'UNSPECIFIED'::"text"])))),
    CONSTRAINT "students_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'INACTIVE'::"text", 'PAUSED'::"text", 'GRADUATED'::"text", 'ARCHIVED'::"text"])))
);


ALTER TABLE "public"."students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teacher_branches" (
    "teacher_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."teacher_branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teachers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "teacher_code" "text" NOT NULL,
    "qualification" "text",
    "hire_date" "date",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "teachers_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'INACTIVE'::"text", 'ON_LEAVE'::"text", 'ARCHIVED'::"text"])))
);


ALTER TABLE "public"."teachers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "branch_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curriculum_levels"
    ADD CONSTRAINT "curriculum_levels_curriculum_id_code_key" UNIQUE ("curriculum_id", "code");



ALTER TABLE ONLY "public"."curriculum_levels"
    ADD CONSTRAINT "curriculum_levels_curriculum_id_sequence_no_key" UNIQUE ("curriculum_id", "sequence_no");



ALTER TABLE ONLY "public"."curriculum_levels"
    ADD CONSTRAINT "curriculum_levels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curriculum_subject_components"
    ADD CONSTRAINT "curriculum_subject_components_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curriculum_subject_components"
    ADD CONSTRAINT "curriculum_subject_components_subject_id_code_key" UNIQUE ("subject_id", "code");



ALTER TABLE ONLY "public"."curriculum_subjects"
    ADD CONSTRAINT "curriculum_subjects_level_id_code_key" UNIQUE ("level_id", "code");



ALTER TABLE ONLY "public"."curriculum_subjects"
    ADD CONSTRAINT "curriculum_subjects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curriculums"
    ADD CONSTRAINT "curriculums_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."curriculums"
    ADD CONSTRAINT "curriculums_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_parent_code_key" UNIQUE ("parent_code");



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_component_progress"
    ADD CONSTRAINT "student_component_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_component_progress"
    ADD CONSTRAINT "student_component_progress_subject_progress_id_component_id_key" UNIQUE ("subject_progress_id", "component_id");



ALTER TABLE ONLY "public"."student_curriculum_enrollments"
    ADD CONSTRAINT "student_curriculum_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_level_progress"
    ADD CONSTRAINT "student_level_progress_enrollment_id_level_id_key" UNIQUE ("enrollment_id", "level_id");



ALTER TABLE ONLY "public"."student_level_progress"
    ADD CONSTRAINT "student_level_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_parents"
    ADD CONSTRAINT "student_parents_pkey" PRIMARY KEY ("student_id", "parent_id");



ALTER TABLE ONLY "public"."student_subject_progress"
    ADD CONSTRAINT "student_subject_progress_level_progress_id_subject_id_key" UNIQUE ("level_progress_id", "subject_id");



ALTER TABLE ONLY "public"."student_subject_progress"
    ADD CONSTRAINT "student_subject_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_student_code_key" UNIQUE ("student_code");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."teacher_branches"
    ADD CONSTRAINT "teacher_branches_pkey" PRIMARY KEY ("teacher_id", "branch_id");



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_teacher_code_key" UNIQUE ("teacher_code");



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_curriculum_components_subject" ON "public"."curriculum_subject_components" USING "btree" ("subject_id");



CREATE INDEX "idx_curriculum_levels_curriculum" ON "public"."curriculum_levels" USING "btree" ("curriculum_id");



CREATE INDEX "idx_curriculum_levels_sequence" ON "public"."curriculum_levels" USING "btree" ("curriculum_id", "sequence_no");



CREATE INDEX "idx_curriculum_subjects_family" ON "public"."curriculum_subjects" USING "btree" ("family_code");



CREATE INDEX "idx_curriculum_subjects_level" ON "public"."curriculum_subjects" USING "btree" ("level_id");



CREATE INDEX "idx_student_component_progress_subject" ON "public"."student_component_progress" USING "btree" ("subject_progress_id");



CREATE UNIQUE INDEX "idx_student_curriculum_active_unique" ON "public"."student_curriculum_enrollments" USING "btree" ("student_id", "curriculum_id") WHERE ("status" = ANY (ARRAY['ACTIVE'::"text", 'PAUSED'::"text"]));



CREATE INDEX "idx_student_curriculum_student" ON "public"."student_curriculum_enrollments" USING "btree" ("student_id");



CREATE INDEX "idx_student_level_progress_enrollment" ON "public"."student_level_progress" USING "btree" ("enrollment_id");



CREATE UNIQUE INDEX "idx_student_primary_curriculum_unique" ON "public"."student_curriculum_enrollments" USING "btree" ("student_id") WHERE (("is_primary" = true) AND ("status" = ANY (ARRAY['ACTIVE'::"text", 'PAUSED'::"text"])));



CREATE INDEX "idx_student_subject_progress_level" ON "public"."student_subject_progress" USING "btree" ("level_progress_id");



CREATE INDEX "students_created_at_idx" ON "public"."students" USING "btree" ("created_at" DESC);



CREATE INDEX "students_default_branch_idx" ON "public"."students" USING "btree" ("default_branch_id");



CREATE INDEX "students_full_name_idx" ON "public"."students" USING "btree" ("full_name");



CREATE INDEX "students_status_idx" ON "public"."students" USING "btree" ("status");



CREATE UNIQUE INDEX "user_roles_unique_scope" ON "public"."user_roles" USING "btree" ("user_id", "role_id", COALESCE("branch_id", '00000000-0000-0000-0000-000000000000'::"uuid"));



CREATE OR REPLACE TRIGGER "branches_set_updated_at" BEFORE UPDATE ON "public"."branches" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "parents_set_updated_at" BEFORE UPDATE ON "public"."parents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "roles_set_updated_at" BEFORE UPDATE ON "public"."roles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "students_set_updated_at" BEFORE UPDATE ON "public"."students" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "teachers_set_updated_at" BEFORE UPDATE ON "public"."teachers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();









ALTER TABLE ONLY "public"."curriculum_levels"
    ADD CONSTRAINT "curriculum_levels_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curriculums"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curriculum_subject_components"
    ADD CONSTRAINT "curriculum_subject_components_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."curriculum_subjects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curriculum_subjects"
    ADD CONSTRAINT "curriculum_subjects_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "public"."curriculum_levels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_component_progress"
    ADD CONSTRAINT "student_component_progress_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "public"."curriculum_subject_components"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."student_component_progress"
    ADD CONSTRAINT "student_component_progress_subject_progress_id_fkey" FOREIGN KEY ("subject_progress_id") REFERENCES "public"."student_subject_progress"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_curriculum_enrollments"
    ADD CONSTRAINT "student_curriculum_enrollments_current_level_id_fkey" FOREIGN KEY ("current_level_id") REFERENCES "public"."curriculum_levels"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."student_curriculum_enrollments"
    ADD CONSTRAINT "student_curriculum_enrollments_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curriculums"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."student_curriculum_enrollments"
    ADD CONSTRAINT "student_curriculum_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_level_progress"
    ADD CONSTRAINT "student_level_progress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."student_curriculum_enrollments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_level_progress"
    ADD CONSTRAINT "student_level_progress_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "public"."curriculum_levels"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."student_parents"
    ADD CONSTRAINT "student_parents_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_parents"
    ADD CONSTRAINT "student_parents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_subject_progress"
    ADD CONSTRAINT "student_subject_progress_level_progress_id_fkey" FOREIGN KEY ("level_progress_id") REFERENCES "public"."student_level_progress"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_subject_progress"
    ADD CONSTRAINT "student_subject_progress_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."curriculum_subjects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_default_branch_id_fkey" FOREIGN KEY ("default_branch_id") REFERENCES "public"."branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teacher_branches"
    ADD CONSTRAINT "teacher_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teacher_branches"
    ADD CONSTRAINT "teacher_branches_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated users can view branches" ON "public"."branches" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users view permissions" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users view role permissions" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users view roles" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Parent views own parent record" ON "public"."parents" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"('SUPER_ADMIN'::"text")));



CREATE POLICY "Student views own student record" ON "public"."students" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"('SUPER_ADMIN'::"text")));



CREATE POLICY "Super admin manages branches" ON "public"."branches" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "Super admin manages parents" ON "public"."parents" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "Super admin manages permissions" ON "public"."permissions" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "Super admin manages role permissions" ON "public"."role_permissions" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "Super admin manages roles" ON "public"."roles" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "Super admin manages student parent links" ON "public"."student_parents" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "Super admin manages students" ON "public"."students" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "Super admin manages teacher branches" ON "public"."teacher_branches" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "Super admin manages teachers" ON "public"."teachers" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "Super admin manages user roles" ON "public"."user_roles" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "Teacher views own branch links" ON "public"."teacher_branches" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."teachers" "t"
  WHERE (("t"."id" = "teacher_branches"."teacher_id") AND ("t"."user_id" = "auth"."uid"())))) OR "public"."has_role"('SUPER_ADMIN'::"text")));



CREATE POLICY "Teacher views own teacher record" ON "public"."teachers" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"('SUPER_ADMIN'::"text")));



CREATE POLICY "Users create own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((("id" = "auth"."uid"()) OR "public"."has_role"('SUPER_ADMIN'::"text")));



CREATE POLICY "Users update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."has_role"('SUPER_ADMIN'::"text"))) WITH CHECK ((("id" = "auth"."uid"()) OR "public"."has_role"('SUPER_ADMIN'::"text")));



CREATE POLICY "Users view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."has_role"('SUPER_ADMIN'::"text")));



CREATE POLICY "Users view own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"('SUPER_ADMIN'::"text")));



ALTER TABLE "public"."branches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curriculum_levels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curriculum_subject_components" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curriculum_subjects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curriculums" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_component_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_curriculum_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_level_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_parents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_subject_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "super_admin_manage_curriculum_levels" ON "public"."curriculum_levels" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "super_admin_manage_curriculum_subject_components" ON "public"."curriculum_subject_components" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "super_admin_manage_curriculum_subjects" ON "public"."curriculum_subjects" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "super_admin_manage_curriculums" ON "public"."curriculums" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "super_admin_manage_student_component_progress" ON "public"."student_component_progress" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "super_admin_manage_student_curriculum_enrollments" ON "public"."student_curriculum_enrollments" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "super_admin_manage_student_level_progress" ON "public"."student_level_progress" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



CREATE POLICY "super_admin_manage_student_subject_progress" ON "public"."student_subject_progress" TO "authenticated" USING ("public"."has_role"('SUPER_ADMIN'::"text")) WITH CHECK ("public"."has_role"('SUPER_ADMIN'::"text"));



ALTER TABLE "public"."teacher_branches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teachers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_role"("role_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("role_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("role_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("role_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";









GRANT ALL ON TABLE "public"."branches" TO "anon";
GRANT ALL ON TABLE "public"."branches" TO "authenticated";
GRANT ALL ON TABLE "public"."branches" TO "service_role";



GRANT ALL ON TABLE "public"."curriculum_levels" TO "anon";
GRANT ALL ON TABLE "public"."curriculum_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."curriculum_levels" TO "service_role";



GRANT ALL ON TABLE "public"."curriculum_subject_components" TO "anon";
GRANT ALL ON TABLE "public"."curriculum_subject_components" TO "authenticated";
GRANT ALL ON TABLE "public"."curriculum_subject_components" TO "service_role";



GRANT ALL ON TABLE "public"."curriculum_subjects" TO "anon";
GRANT ALL ON TABLE "public"."curriculum_subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."curriculum_subjects" TO "service_role";



GRANT ALL ON TABLE "public"."curriculums" TO "anon";
GRANT ALL ON TABLE "public"."curriculums" TO "authenticated";
GRANT ALL ON TABLE "public"."curriculums" TO "service_role";



GRANT ALL ON TABLE "public"."parents" TO "anon";
GRANT ALL ON TABLE "public"."parents" TO "authenticated";
GRANT ALL ON TABLE "public"."parents" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."student_component_progress" TO "anon";
GRANT ALL ON TABLE "public"."student_component_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."student_component_progress" TO "service_role";



GRANT ALL ON TABLE "public"."student_curriculum_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."student_curriculum_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."student_curriculum_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."student_level_progress" TO "anon";
GRANT ALL ON TABLE "public"."student_level_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."student_level_progress" TO "service_role";



GRANT ALL ON TABLE "public"."student_parents" TO "anon";
GRANT ALL ON TABLE "public"."student_parents" TO "authenticated";
GRANT ALL ON TABLE "public"."student_parents" TO "service_role";



GRANT ALL ON TABLE "public"."student_subject_progress" TO "anon";
GRANT ALL ON TABLE "public"."student_subject_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."student_subject_progress" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";



GRANT ALL ON TABLE "public"."teacher_branches" TO "anon";
GRANT ALL ON TABLE "public"."teacher_branches" TO "authenticated";
GRANT ALL ON TABLE "public"."teacher_branches" TO "service_role";



GRANT ALL ON TABLE "public"."teachers" TO "anon";
GRANT ALL ON TABLE "public"."teachers" TO "authenticated";
GRANT ALL ON TABLE "public"."teachers" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







