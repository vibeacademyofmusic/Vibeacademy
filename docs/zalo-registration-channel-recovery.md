# Local registration channel recovery — 2026-09-28

Registration: DK-20260928-FD2F73B7315B (`32f4fe9a-17b9-4764-9d45-fd2f73b7315b`).
Preview: http://localhost:3000/admin/business/registrations/32f4fe9a-17b9-4764-9d45-fd2f73b7315b

## Proven cause

Port 3000 is PID 12046, Next 16.3.3, working directory `/Users/macbookair/vibe-academy-system`, branch `feature/learning-report-v2`, HEAD `45822a4d9dd56317324f9c554df76b42f55c1199` plus preserved pending work. API `http://127.0.0.1:54321`, database container `supabase_db_vibe-academy-system`. This registration does not exist in the old CRM preview DB. No separate notification worker process was found; the generic Zalo worker adapter remains disabled. The separate renewal scheduler never sends customer notifications.

Registration COMPLETED, full payment 5,500,000 VND verified, completion/placement timestamp 04:20:18 Vietnam time. Parent phone has valid normalization, but there are zero phone-consent records (including revoked records) for this registration. No phone recipient was snapshotted. The original notification `f378df52-76e0-4b37-9a47-43666e8d9afa` is SKIPPED_NO_CHANNEL, attempts 0, no provider attempts/message ID/acceptance/delivery, and only CREATED in its event history. This is a pre-send eligibility block, not a demonstrated expired token or provider rejection. No eligible UID was found by enqueue at completion; PHONE eligibility is independent of UID.

Template 640377 is APPROVED but enabled=false. Approval and send enablement are distinct. Credentials are separately ownership-blocked from the preceding renewal task; that is not the reason this job was skipped. No token refresh was attempted here.

## Fix

- Registration screen separates payment/completion from **Chưa gửi**, shows missing consent and disabled send gate, and exposes safe technical status/attempt count.
- Existing authorized consent UI now explains which recipient must consent and that payment is not consent. Confirmation is required; errors are Vietnamese. RPC serializes consent changes against claims.
- Explicit **Đánh giá lại kênh nhận tin** reuses the same unattempted job/idempotency key and adds an audit event when successfully prepared. It never sends, creates consent, creates another job, or changes business records. A disabled template leaves preparation blocked.
- Existing PHONE dispatch decision now enforces enabled as well as APPROVED. Worker and manual claims share this decision. No send gate was enabled.
- Changed recipient/consent identity cannot silently replace a snapshot. Attempted, ambiguous, accepted and delivered jobs remain protected.
- Full payment uses **Đã thanh toán đủ** and current registration parameters.

Changed files:
- `app/admin/business/registrations/[id]/page.tsx`
- `app/admin/business/registrations/actions.ts`
- `lib/integrations/zalo/recovery-labels.ts`
- `supabase/migrations/20260928070000_zalo_channel_recovery.sql` (applied MAIN local only)
- `supabase/tests/database/zalo_channel_recovery_test.sql`
- `supabase/tests/database/zalo_durable_recovery_test.sql` (disabled-gate expected reason)
- `tests/zalo-channel-recovery.test.cjs`
- this report

## Verification and remaining action

75/75 Zalo/notification tests pass, including 17 new rollback database assertions plus existing durable claim/retry/accepted/delivery protections. TypeScript and lint on touched runtime files pass. No full build run for this change; the active dev preview remains running.

Authenticated browser: actual registration opened, correct full-payment data and new warnings observed. Clicking re-evaluate returned NO_CONSENT. Desktop and mobile 390px rendered with existing VIBE cards/notices/buttons; mobile content width equals viewport width. Consent persistence was verified through the same authorized RPC in isolated rollback fixtures, not by fabricating consent on the real registration. All test data rolled back. The real job still has zero attempts and zero consents.

Owner action: obtain genuine consent from this registration's guardian for the actual recipient, record it in **Zalo qua số điện thoại**. Authorized operations must intentionally enable the template send gate and resolve the separate OA credential-ownership/connection prerequisite before sending. Then evaluate the existing job and use the existing administrator recovery/send flow, once eligible. Do not pay again, redo registration, or resend accepted/ambiguous messages.

No real send, consent fabrication, payment replay, student/receipt/placement recreation, database reset, production/staging change, push, or deployment. This does not establish live automatic token-renewal readiness.

## Owner confirmation follow-up

Owner confirmed the OA is shared with another system (identity pending), and the guardian has consented for the phone already on this registration. Recorded that confirmation through the existing authenticated registration UI. Database readback: exactly one active consent, normalized recipient matches registration phone; no provider attempt was created. The screen now displays the masked consented phone. Send gate remains disabled and credential ownership is not asserted for MAIN. No independent local token rotation or customer send is authorized by this consent recording.
