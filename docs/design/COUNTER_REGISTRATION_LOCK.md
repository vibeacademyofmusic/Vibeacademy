# Counter registration payment and Zalo contract

Registration completion requires a signed PayOS PAID result bound to the exact stored order, payment link and amount. A browser success redirect is not proof of payment. Hosted reconciliation requires PAYOS_WEBHOOK_ENABLED=true, a valid staff session and a branch-visible pending order.

After the verified payment RPC commits, dispatch uses the durable registration outbox. It requires current recipient consent, the approved enabled template, a usable shared OA credential, and a successful atomic attempt claim. A claimed/accepted/unknown attempt must never be reset to resend automatically. Zalo acceptance and actual delivery remain separate states.

`docs/design/approved-auth-design.json` now also pins the payment reconciliation, provider client/webhook, Zalo sender/dispatcher and their business regression tests. The Vercel project build command pins that manifest. npm prebuild runs `test:counter-registration`; missing or changed protected source stops a build rather than silently restoring the localhost-only implementation.

Intentional changes require review, passing business tests and updating the manifest and project hash together. A Vercel administrator can still intentionally bypass builds through project settings, prebuilt uploads or promotion of an old deployment; those actions must verify the same contract.
