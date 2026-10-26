import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const tables = ['rooms', 'schedules', 'classes', 'class_teachers', 'session_occurrences', 'enrollments', 'attendance_records', 'session_occurrence_participants', 'placement_time_windows']
const guards = [
  ['schedules', 'trg_schedule_single_weekly_shift'], ['schedules', 'trg_schedule_room_booking'], ['schedules', 'trg_zz_schedule_teacher_parallel_atomic'],
  ['class_teachers', 'trg_zz_class_teacher_parallel_atomic'], ['session_occurrences', 'trg_zz_occurrence_teacher_atomic'],
  ['class_teachers', 'trg_zzz_class_teacher_occurrence_atomic'], ['session_occurrences', 'trg_occurrence_room_booking'],
  ['session_occurrence_participants', 'trg_makeup_room_capacity'], ['rooms', 'trg_room_schedule_configuration'],
  ['classes', 'trg_class_room_capacity'], ['enrollments', 'trg_room_capacity_enrollment_guard'],
]
const source = readFileSync('supabase/migrations/20261025013000_cross_class_makeup_roster.sql', 'utf8')
const rollback = readFileSync('scripts/sql/rollback-caday-room-guards-20261024.sql', 'utf8')
const restore = readFileSync('scripts/sql/restore-caday-room-guards-20261024.sql', 'utf8')

test('actual gate SQL blocks all nine tables, rooms included, and restores only a complete gate', async t => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema maintenance_private;
      create function public.test_guard() returns trigger language plpgsql as $$ begin return new; end; $$;
      ${tables.map(table => `create table public.${table}(id int primary key, capacity int); insert into public.${table} values(1,6); grant all on public.${table} to service_role;`).join('\n')}
      ${guards.map(([table, name]) => `create trigger ${name} before insert or update on public.${table} for each row execute function public.test_guard();`).join('\n')}
      create function public.test_definer_room_write() returns void language sql security definer set search_path=public as $$ update public.rooms set capacity=2 where id=1 $$;
    `)
    await db.exec(source.slice(source.indexOf('-- Writes stay open')))
    await db.exec(rollback)
    await t.test('service role cannot insert, update or delete in any protected table', async () => {
      await db.exec('set role service_role;')
      for (const table of tables) {
        for (const sql of [`insert into public.${table} values(2,6)`, `update public.${table} set capacity=2 where id=1`, `delete from public.${table} where id=1`]) {
          await assert.rejects(db.exec(sql), /TEACHING_SHIFT_WRITES_STOPPED/, sql)
        }
      }
      await assert.rejects(db.exec('select public.test_definer_room_write()'), /TEACHING_SHIFT_WRITES_STOPPED/)
      await db.exec('reset role;')
      assert.equal((await db.query('select capacity from rooms where id=1')).rows[0].capacity, 6)
    })
    await t.test('reenabling guards reopens legitimate room writes', async () => {
      await db.exec(restore)
      await db.exec('set role service_role; update public.rooms set capacity=5 where id=1; reset role;')
      assert.equal((await db.query('select capacity from rooms where id=1')).rows[0].capacity, 5)
    })
    await t.test('missing gate row fails closed', async () => {
      await db.exec('begin; delete from maintenance_private.teaching_shift_write_gate;')
      await assert.rejects(db.exec('update public.rooms set capacity=2 where id=1'), /TEACHING_SHIFT_WRITES_STOPPED/)
      await db.exec('rollback;')
    })
    await t.test('restore refuses a missing room gate and rolls back guard reenable', async () => {
      await db.exec(rollback)
      await db.exec('drop trigger trg_00_teaching_shift_write_gate on rooms;')
      await assert.rejects(db.exec(restore), /CADAY_WRITE_GATE_TRIGGER_SET_CHANGED/)
      await db.exec('rollback;')
      assert.equal((await db.query("select writes from maintenance_private.teaching_shift_write_gate")).rows[0].writes, 'stopped')
      assert.equal((await db.query("select tgenabled from pg_trigger where tgname='trg_room_schedule_configuration'")).rows[0].tgenabled, 'D')
    })
  } finally { await db.close() }
})
