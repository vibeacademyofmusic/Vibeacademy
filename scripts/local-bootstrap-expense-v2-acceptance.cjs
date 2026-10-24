#!/usr/bin/env node
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')
const { guardedFetch, localUrl } = require('./local-bootstrap-admin.cjs')

const ROOT = path.resolve(__dirname, '..')
const EMPLOYEE_EMAIL = 'expense.employee@vibe.local'
const EMPLOYEE_PASSWORD = 'LocalExpenseV2-Employee-2026!'
const REVIEWER_EMAIL = 'expense.reviewer@vibe.local'
const REVIEWER_PASSWORD = 'LocalExpenseV2-Reviewer-2026!'

function readLocalStatus() {
  const output = execFileSync(path.join(ROOT, 'node_modules/.bin/supabase'), ['status', '-o', 'env'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const values = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="([^"]*)"$/)
    if (match) values[match[1]] = match[2]
  }
  const url = localUrl(values.API_URL)
  if (!values.SERVICE_ROLE_KEY) throw new Error('Local Supabase service-role credential is missing.')
  return { url, key: values.SERVICE_ROLE_KEY }
}

async function ensureLocalUser(client, email, password) {
  let user
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error(`Cannot list local auth users for ${email}.`)
    user = data.users.find(item => item.email?.toLowerCase() === email)
    if (user || data.users.length < 100) break
  }
  if (!user) {
    const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) throw new Error(`Cannot create local auth user ${email}.`)
    return data.user
  }
  const { data, error } = await client.auth.admin.updateUserById(user.id, { password, email_confirm: true })
  if (error || !data.user) throw new Error(`Cannot set the local acceptance password for ${email}.`)
  return data.user
}

async function main() {
  const { url, key } = readLocalStatus()
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: guardedFetch(url) },
  })
  const employeeUser = await ensureLocalUser(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
  const reviewerUser = await ensureLocalUser(client, REVIEWER_EMAIL, REVIEWER_PASSWORD)

  const projectName = path.basename(ROOT)
  if (!/^[A-Za-z0-9._-]+$/.test(projectName)) throw new Error('Unsafe local project name.')
  const container = `supabase_db_${projectName}`
  const sql = String.raw`
begin;

select set_config('vibe.fixture.employee_user',:'employee_user',false);
select set_config('vibe.fixture.reviewer_user',:'reviewer_user',false);

insert into public.profiles(id,full_name,status) values
  (:'employee_user'::uuid,'Local Expense Employee','ACTIVE'),
  (:'reviewer_user'::uuid,'Local Expense Reviewer','ACTIVE')
on conflict(id) do update set full_name=excluded.full_name,status='ACTIVE';

insert into public.user_roles(user_id,role_id)
select :'employee_user'::uuid,r.id from public.roles r where r.code='SUPER_ADMIN'
  and not exists(select 1 from public.user_roles ur where ur.user_id=:'employee_user'::uuid and ur.role_id=r.id and ur.branch_id is null);
insert into public.user_roles(user_id,role_id)
select :'employee_user'::uuid,r.id from public.roles r where r.code='STAFF'
  and not exists(select 1 from public.user_roles ur where ur.user_id=:'employee_user'::uuid and ur.role_id=r.id and ur.branch_id is null);
insert into public.user_roles(user_id,role_id)
select :'reviewer_user'::uuid,r.id from public.roles r where r.code='SUPER_ADMIN'
  and not exists(select 1 from public.user_roles ur where ur.user_id=:'reviewer_user'::uuid and ur.role_id=r.id and ur.branch_id is null);

insert into public.branches(id,code,name,status)
values('ea100000-0000-4000-8000-000000000001','LOCAL-EXP-V2','Local Expense Acceptance','ACTIVE')
on conflict(id) do nothing;

do $fixture_branch$
begin
  if not exists(select 1 from public.branches where id='ea100000-0000-4000-8000-000000000001' and code='LOCAL-EXP-V2' and status='ACTIVE') then
    raise exception 'LOCAL_EXPENSE_FIXTURE_BRANCH_CONFLICT';
  end if;
  if exists(select 1 from public.organization_units where code='ST' and branch_id is not null and branch_id<>'ea100000-0000-4000-8000-000000000001') then
    raise exception 'LOCAL_EXPENSE_FIXTURE_ST_ALREADY_MAPPED';
  end if;
end;
$fixture_branch$;
update public.organization_units set branch_id='ea100000-0000-4000-8000-000000000001' where code='ST';

insert into public.employees(id,employee_code,home_unit,hire_date,profile_id,created_by)
values('ea300000-0000-4000-8000-000000000001','LOCAL-EXP-V2','HQ','2026-01-01',:'employee_user'::uuid,:'reviewer_user'::uuid)
on conflict(id) do nothing;

do $fixture_employee$
begin
  if not exists(select 1 from public.employees where id='ea300000-0000-4000-8000-000000000001'
      and employee_code='LOCAL-EXP-V2' and profile_id=current_setting('vibe.fixture.employee_user')::uuid and home_unit='HQ') then
    raise exception 'LOCAL_EXPENSE_FIXTURE_EMPLOYEE_CONFLICT';
  end if;
end;
$fixture_employee$;

insert into public.employee_versions(employee_id,version,effective_on,full_name,unit_code,employee_group,employment_status,pay_type,reason,created_by)
select 'ea300000-0000-4000-8000-000000000001',1,'2026-01-01','Local Expense Employee','HQ','STAFF','ACTIVE','MONTHLY','Local browser acceptance fixture',:'reviewer_user'::uuid
where not exists(select 1 from public.employee_versions where employee_id='ea300000-0000-4000-8000-000000000001' and version=1);

do $fixture_trip$
declare trip_uuid uuid;
begin
  select t.id into trip_uuid from public.employee_trips t
  where t.employee_id='ea300000-0000-4000-8000-000000000001'
    and t.starts_on='2026-09-15' and t.ends_on='2026-09-16'
    and t.reason='Local Expense V2 browser acceptance'
  limit 1;
  if trip_uuid is null then
    perform set_config('request.jwt.claim.sub',current_setting('vibe.fixture.employee_user'),true);
    trip_uuid:=public.request_employee_trip(
      'ea300000-0000-4000-8000-000000000001','ST','ea100000-0000-4000-8000-000000000001',
      '2026-09-15','2026-09-16','Local Expense V2 browser acceptance'
    );
  end if;
  perform set_config('request.jwt.claim.sub',current_setting('vibe.fixture.reviewer_user'),true);
  perform public.review_employee_trip(trip_uuid,'APPROVED','Independent local acceptance approval');
  if exists(select 1 from public.employee_expense_claims c where c.trip_id=trip_uuid)
     or exists(select 1 from public.employee_expense_claim_lines l where l.trip_id=trip_uuid and l.reservation_active) then
    raise exception 'LOCAL_EXPENSE_FIXTURE_TRIP_ALREADY_CLAIMED';
  end if;
end;
$fixture_trip$;

commit;

select e.employee_code,e.profile_id,p.status profile_status,v.full_name,v.unit_code,v.employment_status,
  u.branch_id,b.name branch_name
from public.employees e join public.profiles p on p.id=e.profile_id
join lateral(select ev.* from public.employee_versions ev where ev.employee_id=e.id order by ev.effective_on desc,ev.version desc limit 1) v on true
join public.organization_units u on u.code=v.unit_code join public.branches b on b.id=u.branch_id
where e.id='ea300000-0000-4000-8000-000000000001';

select t.id trip_id,t.starts_on,t.ends_on,t.reason,t.origin_unit,t.destination_unit,b.name destination_branch,
  r.decision,r.checker,
  exists(select 1 from public.employee_expense_claims c where c.trip_id=t.id) has_expense_claim
from public.employee_trips t join public.employee_trip_reviews r on r.trip_id=t.id
join public.branches b on b.id=t.destination_branch_id
where t.employee_id='ea300000-0000-4000-8000-000000000001'
  and t.reason='Local Expense V2 browser acceptance';
`
  const output = execFileSync('docker', [
    'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1',
    '-v', `employee_user=${employeeUser.id}`, '-v', `reviewer_user=${reviewerUser.id}`,
  ], { input: sql, encoding: 'utf8' })

  console.log(output.trim())
  console.log(`Employee login: ${EMPLOYEE_EMAIL}\nEmployee password: ${EMPLOYEE_PASSWORD}`)
  console.log(`Reviewer login: ${REVIEWER_EMAIL}\nReviewer password: ${REVIEWER_PASSWORD}`)
  console.log('LOCAL ONLY: no remote database was contacted or changed.')
}

if (require.main === module) main().catch(error => {
  console.error(`FAILED: ${error.message}`)
  process.exitCode = 1
})
