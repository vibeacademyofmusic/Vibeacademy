OWNER DECISION — PHASE 7 PAYROLL V1.1

Proceed with Phase 7 using the following canonical payroll policies.

=========================================================
1. MONTHLY WORK-UNIT BASIS
=========================================================

Use SCHEDULED PAYABLE MINUTES as the canonical work-unit basis.

Do NOT assign arbitrary equal "day" weights to shifts of different duration.

Examples:

Saturday morning:
08:00–11:00
= 180 scheduled minutes

Normal afternoon:
14:00–21:00
= 420 scheduled minutes

Approved HQ branch-business-trip Sunday:
14:00–18:00
= 240 scheduled minutes

Therefore a 3-hour shift, 4-hour approved business-trip shift and 7-hour shift
are proportionate to their approved scheduled duration.

Do not hardcode 3h/7h/4h special monetary weights.

The canonical source is the effective-dated employee work schedule /
approved schedule override.

=========================================================
2. MONTHLY REQUIRED WORK MINUTES
=========================================================

For a monthly salaried employee:

required scheduled minutes for the payroll period
=
sum of all applicable payable scheduled shifts for that employee during the
period after applying:

- organization/unit schedule
- effective employee assignment
- scheduled-off policy
- approved schedule overrides
- approved business-trip overrides

SCHEDULED_OFF contributes:

0 required work minutes

and must NOT reduce salary.

=========================================================
3. PAYABLE MINUTES
=========================================================

For V1, conceptually treat the following as payable according to valid policy:

WORKED
PAID_LEAVE
BUSINESS_TRIP

SCHEDULED_OFF is not an absence and does not create required minutes.

UNPAID_LEAVE and UNAUTHORIZED_ABSENCE are non-payable.

Payable work ratio may conceptually derive from:

payable scheduled minutes
/
required scheduled minutes

Do not use calendar-day count as the canonical basis when shifts have different
durations.

Handle zero-required-minute edge cases safely.

=========================================================
4. SATURDAY
=========================================================

Saturday has two independent shifts:

08:00–11:00
14:00–21:00

Attendance/payroll must treat them independently.

An employee may satisfy one shift and miss the other.

Do not collapse Saturday into one boolean workday.

=========================================================
5. HQ / ST / LX SUNDAY RULES
=========================================================

HQ normal Sunday:

14:00–21:00
= 420 required scheduled minutes

ST/LX applicable permanent monthly staff:

Sunday afternoon = SCHEDULED_OFF

Therefore:

required scheduled minutes = 0

No absence.
No leave consumption.
No salary deduction merely because they do not work that shift.

=========================================================
6. HQ APPROVED BUSINESS TRIP SUNDAY
=========================================================

For an HQ employee with an approved branch-business-trip override:

Sunday required schedule becomes:

14:00–18:00
= 240 minutes

18:00–21:00 is outside that approved required schedule.

Therefore 18:00–21:00 must NOT become:

- absence
- unpaid leave
- EARLY_LEAVE
- missing payable work minutes

Use the approved schedule override as the payroll source.

=========================================================
7. LATE / EARLY_LEAVE — V1 POLICY
=========================================================

For V1:

LATE and EARLY_LEAVE must be recorded accurately but DO NOT automatically
reduce base salary.

Record at minimum where available:

- scheduled start/end
- actual start/end
- late minutes
- early-leave minutes
- attendance/session evidence
- reason if supplied
- correction history
- audit metadata

Do not automatically convert late/early minutes into salary deduction.

=========================================================
8. PAYROLL DEDUCTION FOR LATE / EARLY
=========================================================

If VIBE management decides a late/early event should create a monetary
deduction:

create an explicit DEDUCTION payroll line.

The deduction must:

- reference the attendance evidence/event
- contain amount
- contain reason
- identify creator
- follow existing approval/maker-checker controls where applicable
- remain auditable

Do not silently alter MONTHLY_BASE.

Do not invent an automatic monetary formula.

=========================================================
9. FUTURE POLICY READINESS
=========================================================

Design the architecture so a future effective-dated policy may define automatic
late/early deduction rules.

But DO NOT activate such automatic deduction in V1.

Future policy may later define thresholds/formulas without rewriting historical
payroll.

Historical payroll must preserve the policy/evidence used at generation time.

=========================================================
10. MONTHLY BASE CALCULATION
=========================================================

Implement monthly salary computation using scheduled/payable work units.

Conceptually:

period_required_minutes
=
sum of required scheduled minutes

period_payable_minutes
=
sum of payable minutes according to approved attendance/leave/business-trip
state

attendance_adjusted_base
=
monthly_base_salary
× payable ratio

subject to appropriate monetary rounding rules already used by the system.

Then:

PAYROLL TOTAL
=
attendance_adjusted MONTHLY_BASE
+ BONUS
+ TRAVEL_ALLOWANCE
+ approved CORRECTION
+ other approved positive adjustments
- DEDUCTION
- other approved negative adjustments

Do not double-deduct the same absence through both base adjustment and a
separate deduction line.

=========================================================
11. TRACEABILITY
=========================================================

Generated MONTHLY_BASE must preserve enough source evidence to explain:

- salary rule used
- required scheduled minutes
- payable minutes
- unpaid minutes
- applicable schedule policy
- business-trip override
- leave evidence
- payroll period
- calculation version

Payroll regeneration must remain deterministic for the same frozen inputs.

FINALIZED payroll remains immutable.

=========================================================
12. REQUIRED REGRESSION TESTS
=========================================================

Add tests covering at least:

1. normal 7-hour worked shift
2. Saturday 3-hour morning shift
3. Saturday 7-hour afternoon shift
4. Saturday one shift worked / one shift absent
5. proportional scheduled-minute calculation
6. HQ Sunday 7-hour schedule
7. ST Sunday SCHEDULED_OFF
8. LX Sunday SCHEDULED_OFF
9. ST/LX scheduled-off creates no salary deduction
10. HQ approved business-trip Sunday = 240 required minutes
11. HQ business-trip 18:00–21:00 creates no missing time
12. PAID_LEAVE remains payable
13. UNPAID_LEAVE reduces payable work units
14. UNAUTHORIZED_ABSENCE reduces payable work units
15. LATE recorded accurately
16. EARLY_LEAVE recorded accurately
17. LATE does not automatically reduce salary
18. EARLY_LEAVE does not automatically reduce salary
19. explicit approved DEDUCTION can reference late/early evidence
20. no duplicate/double deduction
21. PER_SESSION teacher calculation
22. substitute teacher gets eligible session pay
23. primary teacher does not receive substituted session
24. cancelled session excluded
25. effective-dated session-rate change
26. next-period payroll correction
27. off-cycle correction
28. maker-checker
29. finalized payroll immutable
30. inactive employee payroll self-read denied

=========================================================
13. CONTINUE PHASE 7
=========================================================

Now complete the whole Payroll V1.1 phase.

This includes:

- MONTHLY scheduled-minute/work-unit calculation
- PER_SESSION
- retain HOURLY compatibility
- business-trip integration
- payroll line traceability
- bonus/allowance/deduction
- corrections
- maker-checker
- finalized immutability
- Admin UI as required
- employee approved-payroll self-read

Run:

- focused tests
- full pgTAP
- full application/bootstrap tests
- build
- ESLint
- git diff --check
- browser desktop
- browser mobile-responsive

Update the Phase 7 validation documentation.

If Phase 7 PASS:

commit cleanly and continue automatically to Phase 8 according to the Final
Master Execution Prompt.

Production remains HOLD.

Do not push origin/main.
Do not deploy Production.
Do not apply Production migrations.