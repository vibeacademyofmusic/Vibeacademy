# Local tuition reminder dialogs — 2026-10-06

Scope: /Users/macbookair/vibe-academy-system, app port 3000 (PID 35759), loopback Supabase API 127.0.0.1:54321. Existing uncommitted changes preserved. No database migration, deployment, credential/permission change or financial/message form submission performed.

## Implementation

Gửi Zalo, Lịch sử, Gia hạn, Xử lý nhắc and Zalo tự động now use the same shared Modal as student video links. Selected detail appears in a centered, scroll-locked dialog, with internal scrolling, backdrop, accessible title, close button and Escape support. Links disable route scrolling; closing removes the panel but preserves list filters/page. History has its own dialog without a send confirmation button. Existing disabled Nghỉ học/Tạm ngừng remain disabled.

Action return_context is constrained to this exact local route and allowlisted filters/panels; posted external URLs cannot become redirect targets. Zalo consent/contact/send results and renewal failures retain the selected case and list context. Results/errors appear inside the dialog. Missing/failed selected notice loads display an alert instead of silently hiding the detail. The twenty-second response refresh pauses while any operation dialog is open and resumes on the list. Existing authorization, branch/pricing/consent checks and provider reconciliation remain intact. Existing persisted payOS links remain accessible despite notification-template holds.

## Verification

42/42 affected regression checks pass: all five dialog structures, separate history, missing selected records, context/open-redirect safety, invalid actions before writes, pricing/branch denial, persisted checkout reuse, ambiguous provider reconciliation, Zalo send controls, and refresh suspension/cleanup. TypeScript, focused ESLint and git diff --check pass. Tests use synthetic fixtures/mocked providers; no real sends.

Actual authenticated Chrome on localhost:3000: Gia hạn rendered in the shared video-style modal, with the existing INV-2026-000347, zero paid amount, 3-month price 5,500,000 VND/deposit 2,750,000 VND, starts 2026-11-01, due 2026-10-31 and saved payOS URL. Evidence renewal.png and renewal.txt. Escape closed the dialog, removed renew from the URL, and restored focus to Gia hạn while the same table/filter viewport remained visible (closed.png). Rendered design matches the existing video modal: white rounded panel, navy text, shared fields/buttons and blurred backdrop. No financial or message submission was used for this browser check.

## Limits / pending browser checks

Native browser control was intermittently interrupted and returned stale/blank state during history navigation; Chrome extension control was unavailable. Safari and the independent in-app browser returned a role-denial login page; no credentials or sessions were copied and no auth bypass was used. History subsequently rendered with the existing delivered-send and Tiếp tục học response inside a separate centered dialog; evidence history.png/history.txt. Gửi Zalo subsequently rendered the correct recipient mask, existing delivery/reply/consent records, message preview and confirmation control in the same modal (zalo.png/zalo.txt); the send button was not submitted. Process/automatic dialogs are covered by rendered-component tests; their actual browser acceptance and form-result scroll behavior are still pending. Mobile visual acceptance not claimed.

Runtime configuration check showed local ZALO_PILOT_OUTBOUND was already enabled. This run did not alter that setting and did not intentionally submit any real-send action. Blocked-mode tests passed with mock providers; an active runtime outbound block is not claimed.

React checklist: client wrapper only owns closing/navigation; database reads remain server-side and scoped through existing authentication/RLS. Shared Modal provides title, native focus containment, background scroll lock and existing responsive sizing. No new dialog styles, duplicated client fetching, unsafe HTML, or authorization changes. Existing uncommitted checkout fixes were retained.

Owner next action: use the existing authenticated Chrome tab at http://localhost:3000/admin/tuition/reminders. No new sign-in is required in that tab. The requested three main dialogs have rendered-browser evidence; live message/financial submission was deliberately not used as a visual test.
