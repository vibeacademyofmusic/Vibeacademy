const test = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected, renderToStaticMarkup } = require('./helpers/finance-operations.cjs')
const level = { id: id(2), curriculum_id: id(1), code: 'L1', name: 'Grade 1' }
const values = { curriculum_id: id(1), level_id: id(2), subject_id: id(3), family_code: 'SKILL', code: 'DIRECT', name: 'Direct', sort_order: 1, is_required: 'true' }
for (const actionName of ['createCurriculumSubject', 'updateCurriculumSubject']) {
  for (const rule of ['DIRECT_ASSESSMENT', 'ALL_REQUIRED_COMPONENTS']) {
    test(`${actionName} preserves explicit ${rule} and required flag`, async () => {
      const h = harness({ curriculum_levels: [level] })
      const original = h.db.from.bind(h.db)
      h.db.from = table => {
        const query = original(table)
        for (const method of ['insert', 'update']) query[method] = payload => { h.calls.push({ method, payload }); return query }
        return query
      }
      const result = await redirected(h.load('../academic/actions.ts')[actionName], { ...values, completion_rule: rule })
      assert.ok(result.searchParams.has('success'))
      const write = h.calls.find(c => c.payload)
      assert.equal(write.payload.completion_rule, rule)
      assert.equal(write.payload.is_required, true)
      assert.ok(!h.calls.some(c => c.table === 'curriculum_subject_components'))
    })
  }
  for (const rule of ['', 'MANUAL', 'UNSUPPORTED']) test(`${actionName} rejects missing/unsupported method ${rule}`, async () => {
    const h = harness()
    const result = await redirected(h.load('../academic/actions.ts')[actionName], { ...values, completion_rule: rule })
    assert.equal(result.searchParams.get('error'), 'Invalid completion rule')
    assert.ok(!h.calls.some(c => c.table === 'curriculum_subjects'))
  })
}
for (const rule of ['DIRECT_ASSESSMENT', 'MANUAL']) test(`edit form displays explicit methods without silently converting ${rule}`, async () => {
  const h = harness({ curriculums: [{ id: id(1), name: 'Piano' }], curriculum_levels: [level], curriculum_subjects: [{ id: id(3), level_id: id(2), completion_rule: rule, name: 'Direct', is_required: true }] })
  const Page = h.load('../academic/[id]/levels/[levelId]/subjects/[subjectId]/edit/page.tsx').default
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: id(1), levelId: id(2), subjectId: id(3) }), searchParams: Promise.resolve({}) }))
  assert.match(html, /Đánh giá theo thành phần/)
  assert.match(html, /Đánh giá trực tiếp/)
  assert.match(html, /không bắt buộc có thành phần con/)
  assert.doesNotMatch(html, /value="MANUAL"/)
  assert.match(html, rule === 'DIRECT_ASSESSMENT' ? /value="DIRECT_ASSESSMENT" selected=""/ : /selected="" value=""|value=""[^>]*selected=""/)
})
test('assign action forwards inputs and exposes validation failure without success', async () => {
  const h = harness({}, { message: 'A required subject has no required active components' })
  const result = await redirected(h.load('../students/actions.ts').assignStudentAcademicProgram, { student_id: id(4), curriculum_id: id(1), level_id: id(2), started_at: '2026-09-01', is_primary: 'on' })
  assert.equal(result.searchParams.get('error'), 'A required subject has no required active components')
  assert.ok(!result.searchParams.has('success'))
  assert.deepEqual(h.calls.find(c => c.rpc === 'assign_student_academic_program').args, { p_student_id: id(4), p_curriculum_id: id(1), p_level_id: id(2), p_started_at: '2026-09-01', p_is_primary: true })
})
