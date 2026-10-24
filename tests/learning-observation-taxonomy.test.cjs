/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const source = fs.readFileSync('app/admin/learning-journals/priority.ts', 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = { exports: {} }
new Function('exports', 'module', compiled)(loaded.exports, loaded)
const { draftProgressNote, recommendedOptions } = loaded.exports

const options = [
  { code: 'RHYTHM_STABLE_PULSE', dimension: 'RHYTHM', signal: 'STRENGTH', label_vi: 'Duy trì pulse ổn định', draft_clause_vi: 'duy trì nhịp khá ổn định', sort_order: 206, active: true },
  { code: 'ACCURACY_IMPROVED', dimension: 'ACCURACY', signal: 'STRENGTH', label_vi: 'Độ chính xác được cải thiện', draft_clause_vi: 'độ chính xác đã cải thiện', sort_order: 306, active: true },
  { code: 'TECH_FINGERING_UNSTABLE', dimension: 'TECHNIQUE', signal: 'DEVELOPMENT', label_vi: 'Fingering chưa ổn định', draft_clause_vi: 'Fingering/chuyển vị trí vẫn cần tiếp tục củng cố', sort_order: 103, active: true },
]

test('progress draft is deterministic and does not score the student', () => {
  const note = draftProgressNote(options, ['TECH_FINGERING_UNSTABLE', 'RHYTHM_STABLE_PULSE', 'ACCURACY_IMPROVED'])
  assert.equal(note, draftProgressNote(options, ['RHYTHM_STABLE_PULSE', 'ACCURACY_IMPROVED', 'TECH_FINGERING_UNSTABLE']))
  assert.equal(note, 'Em duy trì nhịp khá ổn định và độ chính xác đã cải thiện. Fingering/chuyển vị trí vẫn cần tiếp tục củng cố.')
  assert.equal(note.includes('/5'), false)
})

test('repertoire context prioritizes technique, musicality, accuracy and rhythm', () => {
  const recommended = recommendedOptions(options, 'REPERTOIRE')
  assert.deepEqual(recommended.strength.map(option => option.code), ['ACCURACY_IMPROVED', 'RHYTHM_STABLE_PULSE'])
  assert.deepEqual(recommended.development.map(option => option.code), ['TECH_FINGERING_UNSTABLE'])
})

test('quick entry keeps stable codes out of academic progress', () => {
  const migration = fs.readFileSync('supabase/migrations/20260922270000_learning_observation_taxonomy_v1.sql', 'utf8')
  const page = fs.readFileSync('app/admin/learning-journals/QuickEntry.tsx', 'utf8')
  assert.equal(migration.includes('insert into public.student_component_item_progress'), false)
  assert.match(page, /Xem tất cả/)
  assert.match(page, /Cần VIBE theo dõi/)
  assert.match(page, /DURATION/)
  assert.equal(page.includes('internal_note'), false)
  assert.equal(page.includes('waiting_students'), false)
})
