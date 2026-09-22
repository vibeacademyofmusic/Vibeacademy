# Scheduling conflict engine preflight V1

Status: read-only audit. No shared conflict service was added.

Placement still validates branch, class status, capacity, start-date window, duplicate enrollment, and an explicit course match when `registration_applications.course_id` is set. It does not claim to detect teacher, room, or student timetable clashes. The waiting screen says so.

## What exists

| Question | Current source | Decision |
| --- | --- | --- |
| Student conflict | `enrollments` plus `schedules` (`day_of_week`, `start_time`, `end_time`, `effective_from`, `effective_to`). No overlap function. Pauses and future `started_at` change whether the student is in class, not whether two weekly slots clash. | CREATE later, on top of one shared predicate |
| Teacher conflict | `class_teachers` for the primary assignment window. `reschedule_session_occurrence` rejects a teacher who already has another non-cancelled occurrence overlapping the new clock interval. That check is inside the reschedule function and compares occurrences, not weekly templates. | EXTEND the occurrence predicate; do not copy it |
| Room conflict | `schedules.room_id` and `session_occurrences.room_id`. The same reschedule function rejects a room occupied by another non-cancelled occurrence in the requested interval, and requires the room's branch to match the class. Weekly templates have an index, not an exclusion constraint. | EXTEND the same predicate |

There is also a same-class occurrence overlap check in that function. Makeup credits and reschedules change individual occurrences. They are not a second calendar.

## Why this is not one engine yet

A class placement is a weekly template plus a start date. A reschedule is one concrete `session_occurrences` interval. Those are different clocks:

- A future class can be assigned before any occurrence exists, so an occurrence-only check would report a false clear.
- Two `schedules` rows can share a weekday and clock time without a database exclusion.
- Teacher identity on a template is a dated `class_teachers` row. Teacher identity on an occurrence can later be a session assignment. Treating either one as complete would miss the other.
- Pauses remove a student from a span of sessions. A weekly overlap that ignores pause dates would warn on a student who is not actually attending.

Building three checkers, or a placement checker that only calls the reschedule SQL, would invent a recurrence rule this schema does not state.

## Future target

One security-definer function, consumed by placement, schedule edit, teacher reassignment, makeup scheduling, and room changes. It should accept a candidate interval or a weekly slot, a branch, and optional student, teacher, and room ids, and return structured conflicts. It should not write.

Until that function exists, placement must keep the visible warning and must not pretend a clear result.
