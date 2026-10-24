# Business CRM local UAT — super admin

Date: 2026-09-22. Local only. Production was not contacted.

## Authentication

The login page is an email and password form. `app/login/actions.ts` calls `signInWithPassword`. There is no second local session mechanism.

Browser automation could not type the password in the earlier attempt, and this pass did not put the password into the browser tool. The walkthrough used the same password sign-in against the local Supabase URL configured for the app, stored the resulting session cookie, and requested the rendered Next.js pages at `http://localhost:3000`. Anonymous requests to `/admin/business` returned 307 to `/login`. Each business check below is the rendered HTML plus a database read.

The local admin is `admin@vibe.local` with role `SUPER_ADMIN`. The password was rotated locally for this session and is not recorded here.

## Steps

| Step | UI | Database |
| --- | --- | --- |
| Command center | `/admin/business` returned 200 and showed Điều hành kinh doanh, including Follow-up hôm nay | Snapshot cards rendered numeric counters |
| Create lead | CRM list showed `UAT SMOKE LOCAL Won` | Status `NEW` immediately after create |
| Assign owner | Detail page loaded for that lead | `owner_user_id` is the signed-in super admin |
| Contact through won | Status changes were applied in order: CONTACTED, QUALIFIED, TRIAL_BOOKED, TRIAL_COMPLETED, PROPOSAL_SENT, NEGOTIATING, WON | Each status was read back before the next change. A phone note was stored |
| Lost path | A second lead, `UAT SMOKE LOCAL Lost` | Status `LOST` with the loss note |
| Timeline | Detail HTML included the phone note | Events: CREATED, ASSIGNED, CONTACTED, QUALIFIED, TRIAL_BOOKED, TRIAL_COMPLETED, PROPOSAL_SENT, NEGOTIATION_UPDATED, WON, NOTE_ADDED, FOLLOW_UP_SET |
| Follow-up today | Queue `due` showed `UAT SMOKE LOCAL Due` | Open lead, status CONTACTED, `next_follow_up_on` is the Asia/Ho_Chi_Minh business date |
| Follow-up overdue | Queue `overdue` showed `UAT SMOKE LOCAL Overdue` | Open lead, follow-up date is the previous business date. Won and lost leads are excluded from these queues |
| Campaign | Campaign page showed `UAT SMOKE LOCAL Campaign` and “Chưa có dữ liệu chi phí” | Campaign is ACTIVE, budget is null, and the won lead stores that `campaign_id` |
| Cohort and activity | Reports page showed both funnel headings for program `UAT Smoke Piano` | Both funnel RPCs returned won = 1 for that program |
| Reactivation | The reactivation page showed `UAT SMOKE LOCAL Ended Pause` and did not show the future-pause student | Ended withdrawn pause: one `PAUSE_ENDED_NOT_RETURNED` case. Future pause: 0 cases. Ended pause with the enrollment still ACTIVE: 0 cases |
| Instrument sale | Care page showed serial `UAT-SMOKE-LOCAL-SERIAL` and buyer `UAT SMOKE LOCAL Buyer` | The sale was created with `receive_instrument` then `move_instrument` kind `SALE`. One unit has that serial. Invoice count stayed 0 |
| Warranty and after-sales | The care page rendered the linked sale | Warranty case moved to INSPECTING. A phone follow-up with outcome KEEP_IN_TOUCH was stored |
| Dashboard | Command center returned 200 | Counters: new this month 4, won cohort 1, follow-up today 1, overdue 1, active campaigns 1, open reactivation 1, open warranty 1 |

## Fixtures

Rows are labeled `UAT SMOKE LOCAL`. Lead and instrument events are immutable, so those rows cannot be deleted without disabling history triggers. They are not in a migration or seed. The Gate D local reset removes them with the rest of the local database.

## Result

SUPER_ADMIN LOCAL UAT = PASS, through the application password session and rendered pages. A person did not click each button in the browser.

## Branch admin session

Date: 2026-09-22, after the local reset. The account `branch-admin-a@vibe.local` has `BRANCH_ADMIN` on branch `UAT-BA-A` only. Sign-in used `signInWithPassword`. Pages were the rendered application at `http://localhost:3000`. Passwords are not recorded.

| Check | Evidence |
| --- | --- |
| `/admin/business`, `/crm`, `/campaigns`, `/reports`, `/reactivation`, `/instrument-customers` | Each returned 200 with its heading. The menu showed Kinh doanh and did not link Finance, Payroll, HR, Academic, Students, or Branches |
| `/admin`, `/admin/finance`, `/admin/payroll`, `/admin/hr`, `/admin/academic`, `/admin/students`, `/admin/branches`, `/admin/employees`, `/admin/instruments` | Each returned 307 to `/login` with the no-access error |
| `/admin/system` | This path is not a route. Anonymous and signed-in requests receive the application 404. The body does not render the admin shell or CRM data. The real system page is `/admin/branches`, which is denied |
| Own branch | `crm_can('crm.view', UAT-BA-A)` is true. The CRM list showed `UAT BA LOCAL Branch A Lead` as Đã liên hệ |
| Other branch | `crm_can('crm.view', UAT-BA-B)` is false. The list, campaign page, reactivation page, and instrument page omitted the branch B lead, campaign, student, and serial |
| Create, note, follow-up, CONTACTED, assign | Lead `8ea39487-83eb-432c-b214-36411c4543dc` stored events CREATED, NOTE_ADDED, FOLLOW_UP_SET, and CONTACTED. Owner is the branch admin. Detail HTML included the note and follow-up |
| Campaign | Own campaign `UAT BA LOCAL Campaign A` is visible. `UAT BA LOCAL Campaign B` is not |
| Reports | Cohort for branch B and program `UAT BA Branch B Program` returned new = 0. Own program returned new = 1 |
| Reactivation | Branch B case was not in the branch admin's rows or page |
| Instrument care | Serial `UAT-BA-LOCAL-SERIAL-B` was sold on branch B by a super admin. The branch admin list did not show it. Linking that sale returned `INSTRUMENT_CUSTOMER_UNAUTHORIZED` |
| Dashboard | New-this-month was 0 before the own lead and 1 after it. The branch B lead was not counted |
| Forged branch create | `CRM_LEAD_UNAUTHORIZED` |
| Forged note on the branch B lead | `CRM_LEAD_UNAUTHORIZED` |
| Direct insert and event update | `permission denied` |
| Teacher, no-role, disabled | Each signed-in session received 307 to `/login` for `/admin/business` |
| Anonymous | 307 to `/login` |

Fixtures are labeled `UAT BA LOCAL` on local branches `UAT-BA-A` and `UAT-BA-B`. Lead and instrument events are immutable, so the rows stay labeled in the local database. They are not in a migration or seed.

BRANCH_ADMIN LOCAL UAT = PASS.
