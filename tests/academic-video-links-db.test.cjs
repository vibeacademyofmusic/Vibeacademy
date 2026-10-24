const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createFixture, ids } = require('./helpers/video-link-db-fixture.cjs')

test('video-link migration and PostgreSQL access contract (isolated permission fixtures)', async t => {
  const f = await createFixture()
  let link
  t.after(() => f.db.close())
  await t.test('manager adds internal lesson link and receives matching context', async () => {
    link = await f.save()
    const result = await f.context()
    assert.equal(result.can_manage, true)
    assert.equal(result.links[0].id, link)
    assert.equal(result.links[0].shared_with_family, false)
    assert.equal(result.links[0].lesson_name, 'Methode Book · Bài thực hành · Lesson 1')
    assert.equal(result.lessons[0].id, ids.lesson)
  })
  await t.test('duplicate canonical video is rejected without adding an event', async () => {
    await assert.rejects(f.save(), error => error.code === '23505')
    assert.equal((await f.db.query('select * from academic_video_link_events')).rows.length, 1)
  })
  await t.test('database rejects unsafe URLs even when called outside the UI', async () => {
    for (const url of ['javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=abcdefghijk', 'https://www.youtube.com/watch?v=abc', null]) await assert.rejects(f.save({ url }), /VIDEO_LINK_INVALID/)
  })
  await t.test('database rejects invalid title, note and nullable sharing flags', async () => {
    for (const input of [{ title: ' ' }, { title: null }, { title: 'a'.repeat(161) }, { note: 'a'.repeat(1001) }, { shared: null }, { version: null }]) await assert.rejects(f.save(input), /VIDEO_LINK_INVALID/)
  })
  await t.test('forged student/enrollment pairing is denied', async () => {
    await assert.rejects(f.save({ student: ids.otherLearner }), error => error.code === '42501')
    await assert.rejects(f.context(ids.otherLearner), error => error.code === '42501')
  })
  await t.test('grade and lesson from another curriculum cannot be attached', async () => {
    await assert.rejects(f.save({ level: ids.otherLevel }), /VIDEO_LINK_CONTEXT/)
    await assert.rejects(f.save({ item: ids.otherLesson }), /VIDEO_LINK_CONTEXT/)
    await assert.rejects(f.save({ level: null }), /VIDEO_LINK_LESSON_REQUIRED/)
  })
  for (const user of [ids.parent, ids.studentUser]) await t.test(`family ${user.slice(-1)} cannot read internal links through RPC or direct table`, async () => {
    await f.identity(user)
    const result = await f.context()
    assert.deepEqual(result.links, [])
    assert.deepEqual(result.levels, [])
    assert.deepEqual(result.lessons, [])
    assert.equal(result.can_manage, false)
    assert.deepEqual((await f.db.query('select * from academic_video_links')).rows, [])
    assert.deepEqual((await f.db.query('select * from academic_video_link_events')).rows, [])
  })
  await t.test('assigned teacher reads internal links without mutation rights', async () => {
    await f.identity(ids.teacher)
    assert.equal((await f.context()).links.length, 1)
    assert.equal((await f.context()).can_manage, false)
  })
  for (const user of [ids.parent, ids.studentUser, ids.teacher, ids.stranger, ids.branchAdmin, ids.disabled]) await t.test(`non-writer ${user.slice(-1)} is rejected by both mutation RPCs`, async () => {
    await f.identity(user)
    await assert.rejects(f.save({ id: link, version: 1 }), error => error.code === '42501')
    await assert.rejects(f.remove(link, 1), error => error.code === '42501')
  })
  await t.test('anonymous and service roles cannot call link functions', async () => {
    for (const role of ['anon', 'service_role']) {
      await f.identity(null, role)
      await assert.rejects(f.context(), error => error.code === '42501')
      await assert.rejects(f.save(), error => error.code === '42501')
    }
  })
  await t.test('even an admin cannot bypass RPC auditing through direct DML', async () => {
    await f.identity()
    for (const sql of ["update academic_video_links set title='bypass'", 'delete from academic_video_links', "insert into academic_video_link_events(action) values ('REMOVED')"]) await assert.rejects(f.db.exec(sql), error => error.code === '42501')
  })
  await t.test('sharing update preserves creator and increments version atomically', async () => {
    await f.save({ id: link, version: 1, shared: true })
    const row = (await f.db.query('select * from academic_video_links')).rows[0]
    assert.equal(row.version, 2)
    assert.equal(row.created_by, ids.admin)
    assert.equal(row.shared_with_family, true)
    assert.equal((await f.db.query('select * from academic_video_link_events')).rows.length, 2)
  })
  await t.test('stale edit and stale removal leave current link untouched', async () => {
    await assert.rejects(f.save({ id: link, version: 1 }), /VIDEO_LINK_STALE/)
    await assert.rejects(f.remove(link, 1), /VIDEO_LINK_STALE/)
    assert.equal((await f.context()).links[0].version, 2)
  })
  await t.test('related parent sees shared link; unrelated parent still cannot read it', async () => {
    await f.identity(ids.parent)
    assert.equal((await f.context()).links[0].id, link)
    assert.equal((await f.db.query('select * from academic_video_links')).rows.length, 1)
    await f.identity(ids.stranger)
    await assert.rejects(f.context(), error => error.code === '42501')
    assert.deepEqual((await f.db.query('select * from academic_video_links')).rows, [])
  })
  await t.test('revoked relationship and teacher assignment are rechecked on every read', async () => {
    await f.db.exec('reset role')
    await f.db.query('update fixture_access set active=false where user_id in ($1,$2)', [ids.parent, ids.teacher])
    for (const user of [ids.parent, ids.teacher]) {
      await f.identity(user)
      await assert.rejects(f.context(), error => error.code === '42501')
      assert.deepEqual((await f.db.query('select * from academic_video_links')).rows, [])
    }
  })
  await t.test('removal is scoped, soft-deletes and records immutable audit evidence', async () => {
    await f.identity()
    await assert.rejects(f.remove(link, 2, ids.otherLearner), error => error.code === '42501')
    await f.remove(link, 2)
    assert.deepEqual((await f.context()).links, [])
    const events = (await f.db.query('select * from academic_video_link_events order by created_at,id')).rows
    assert.equal(events.length, 3)
    assert.equal(events.filter(e => e.action === 'REMOVED').length, 1)
    await assert.rejects(f.remove(link, 2), /VIDEO_LINK_STALE/)
    await assert.rejects(f.save({ id: link, version: 3 }), /VIDEO_LINK_STALE/)
  })
  await t.test('a removed URL may be attached again; no academic status changed', async () => {
    await assert.rejects(f.save({ level: null, item: null }), /VIDEO_LINK_LESSON_REQUIRED/)
    const newId = await f.save()
    assert.notEqual(newId, link)
    await f.db.exec('reset role')
    assert.deepEqual((await f.db.query('select status from student_level_progress order by id')).rows.map(r => r.status), ['IN_PROGRESS', 'IN_PROGRESS'])
    assert.deepEqual((await f.db.query('select status from student_curriculum_enrollments order by id')).rows.map(r => r.status), ['ACTIVE', 'ACTIVE'])
  })
})
