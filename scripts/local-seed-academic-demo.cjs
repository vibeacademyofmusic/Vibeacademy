#!/usr/bin/env node
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

const REFUSED = 'REFUSED: local academic demo seed can only run against local Supabase.'
const TEST_CODES = ['TEST_GUITAR', 'TEST_PIANO', 'TEST_DRUMS', 'TEST_VIOLIN']
const CANONICAL_CODES = ['PIANO', 'GUITAR', 'VIOLIN', 'DRUMS']
const CANONICAL_BY_LEGACY = {
  TEST_GUITAR: 'GUITAR',
  TEST_PIANO: 'PIANO',
  TEST_DRUMS: 'DRUMS',
  TEST_VIOLIN: 'VIOLIN',
}
const CANONICAL_NAMES = {
  GUITAR: 'Guitar',
  PIANO: 'Piano',
  VIOLIN: 'Violin',
  DRUMS: 'Trống',
}
const PROGRAMS = [
  { code: 'TEST_GUITAR', name: 'Guitar' },
  { code: 'TEST_PIANO', name: 'Piano' },
  { code: 'TEST_DRUMS', name: 'Drums' },
  { code: 'TEST_VIOLIN', name: 'Violin' },
]
const LEVELS = [
  { code: 'PRE', name: 'Pre', sequence: 1, levelNumber: null, levelType: 'FOUNDATION' },
  ...Array.from({ length: 8 }, (_, index) => ({
    code: `GRADE_${index + 1}`,
    name: `Grade ${index + 1}`,
    sequence: index + 2,
    levelNumber: index + 1,
    levelType: 'GRADE',
  })),
]
const SUBJECTS = [
  { code: 'REPERTOIRE', family: 'REPERTOIRE', label: 'Repertoire' },
  { code: 'TECHNIQUE_FOUNDATION', family: 'TECHNIQUE', label: 'Technique Foundation' },
  { code: 'SIGHTREADING', family: 'SIGHTREADING', label: 'Sightreading' },
  { code: 'AURAL', family: 'AURAL', label: 'Aural' },
]
const FORBIDDEN_SUBJECTS = ['Ensemble', 'Theory', 'History', 'Media Product', 'Composition', 'Exam Preparation']
const LESSON_COUNT = 10

function localUrl(value) {
  let url
  try { url = new URL(value) } catch { throw new Error(REFUSED) }
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol !== 'http:' ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(REFUSED)
  }
  url.hostname = '127.0.0.1'
  return url.origin
}

function guardedFetch(origin, fetchImpl = fetch) {
  origin = localUrl(origin)
  return (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url ?? input.href)
    if (url.origin !== origin) throw new Error(REFUSED)
    return fetchImpl(input, { ...init, redirect: 'error' })
  }
}

function readLocalStatus() {
  let output
  try {
    output = execFileSync(path.resolve(__dirname, '../node_modules/.bin/supabase'),
      ['status', '-o', 'env'], {
        cwd: path.resolve(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      })
  } catch {
    throw new Error('Local Supabase is unavailable. Run npx supabase start first.')
  }
  const values = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="([^"]*)"$/)
    if (match) values[match[1]] = match[2]
  }
  const url = localUrl(values.API_URL)
  if (!values.SERVICE_ROLE_KEY) throw new Error('Local Supabase service-role credential is missing.')
  return { url, key: values.SERVICE_ROLE_KEY }
}

function parseArgs(args) {
  if (!args.length) return 'seed'
  if (args.length === 1 && (args[0] === '--dry-run' || args[0] === '--cleanup')) {
    return args[0] === '--dry-run' ? 'dry-run' : 'cleanup'
  }
  throw new Error('Usage: npm run local:seed-academic-demo -- [--dry-run|--cleanup]')
}

function subjectName(label, level) {
  return level.code === 'PRE' ? `${label} Pre` : `${label} ${level.levelNumber}`
}

function buildPlan() {
  for (const subject of SUBJECTS) {
    if (FORBIDDEN_SUBJECTS.includes(subject.label)) {
      throw new Error(`Forbidden subject ${subject.label}`)
    }
  }
  const levels = []
  const subjects = []
  const components = []
  const lessons = []
  for (const program of PROGRAMS) {
    for (const level of LEVELS) {
      levels.push({
        program: program.code,
        code: level.code,
        name: level.name,
        sequence: level.sequence,
        levelNumber: level.levelNumber,
        levelType: level.levelType,
        completion: 'ALL_REQUIRED_SUBJECTS',
        status: 'ACTIVE',
      })
      SUBJECTS.forEach((subject, index) => {
        const name = subjectName(subject.label, level)
        subjects.push({
          program: program.code,
          level: level.code,
          code: subject.code,
          name,
          family: subject.family,
          sort: index + 1,
          subjectLevel: level.levelNumber,
          completion: 'ALL_REQUIRED_COMPONENTS',
          status: 'ACTIVE',
        })
        components.push({
          program: program.code,
          level: level.code,
          subject: subject.code,
          code: 'CORE',
          name: 'Core',
          sort: 1,
          completion: 'ALL_REQUIRED_ITEMS',
          status: 'ACTIVE',
        })
        for (let number = 1; number <= LESSON_COUNT; number += 1) {
          const code = `L${String(number).padStart(2, '0')}`
          lessons.push({
            program: program.code,
            level: level.code,
            subject: subject.code,
            code,
            name: `Lesson ${code.slice(1)}`,
            sort: number,
            status: 'ACTIVE',
          })
        }
      })
    }
  }
  return {
    programs: PROGRAMS.map(program => ({ ...program, status: 'ACTIVE' })),
    levels,
    subjects,
    components,
    lessons,
    counts: {
      programs: PROGRAMS.length,
      levels: levels.length,
      subjects: subjects.length,
      components: components.length,
      lessons: lessons.length,
    },
  }
}

function missingKeys(desired, existing) {
  const have = new Set(existing)
  return desired.filter(key => !have.has(key))
}

function ownedCurriculumIds(rows) {
  return rows.filter(row => TEST_CODES.includes(row.code) && !CANONICAL_CODES.includes(row.code)).map(row => row.id)
}

function resolveProgramIdentity(curricula, spec) {
  const canonicalCode = CANONICAL_BY_LEGACY[spec.code]
  return curricula.find(row => row.code === canonicalCode || row.code === spec.code) ?? null
}

function printCounts(log, counts) {
  log(`Programs: ${counts.programs}`)
  log(`Levels: ${counts.levels}`)
  log(`Subjects: ${counts.subjects}`)
  log(`Lessons: ${counts.lessons}`)
  log(`Components: ${counts.components}`)
}

function dbError(error) {
  return new Error(error.message || 'Local academic write failed.')
}

async function loadAll(make) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) throw dbError(error)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

async function insertChunks(client, table, rows, columns) {
  const inserted = []
  for (let index = 0; index < rows.length; index += 200) {
    let query = client.from(table).insert(rows.slice(index, index + 200))
    if (columns) query = query.select(columns)
    const { data, error } = await query
    if (error) throw dbError(error)
    if (columns) inserted.push(...(data ?? []))
  }
  return inserted
}

function sameLevel(row, spec) {
  return row.name === spec.name
    && row.sequence_no === spec.sequence
    && row.level_type === spec.levelType
    && row.status === 'ACTIVE'
    && row.completion_rule === 'ALL_REQUIRED_SUBJECTS'
    && (spec.levelNumber == null ? row.level_number == null : row.level_number === spec.levelNumber)
}

async function seed(client, log) {
  const plan = buildPlan()
  const curricula = await loadAll(() => client.from('curriculums').select('id, code, name, status'))
  const nonTestBefore = curricula.filter(row => !TEST_CODES.includes(row.code)).map(row => row.id).sort()
  const { count: coursesBefore, error: courseError } = await client.from('courses').select('id', { count: 'exact', head: true })
  if (courseError) throw dbError(courseError)

  const programs = []
  const skipped = []
  for (const spec of PROGRAMS) {
    const found = resolveProgramIdentity(curricula, spec)
    if (found) {
      skipped.push(found.code)
      continue
    }
    const canonicalCode = CANONICAL_BY_LEGACY[spec.code]
    const { data, error } = await client.from('curriculums').insert({
      code: canonicalCode,
      name: CANONICAL_NAMES[canonicalCode],
      status: 'ACTIVE',
    }).select('id, code, name, status').single()
    if (error) throw dbError(error)
    curricula.push(data)
    programs.push(data)
  }
  if (!programs.length) {
    log(`Canonical programs already exist (${skipped.join(', ')}). No parallel catalog was created.`)
    return { programs: skipped.length, levels: 0, subjects: 0, components: 0, lessons: 0, created: 0 }
  }

  const programIds = programs.map(row => row.id)
  const levelSpecs = new Map(LEVELS.map(level => [level.code, level]))
  const existingLevels = await loadAll(() => client.from('curriculum_levels')
    .select('id, curriculum_id, code, name, sequence_no, level_number, level_type, status, completion_rule')
    .in('curriculum_id', programIds))
  const levels = new Map()
  for (const row of existingLevels) {
    const spec = levelSpecs.get(row.code)
    if (!spec || !sameLevel(row, spec)) {
      throw new Error(`Existing TEST level ${row.code} does not match the approved demo hierarchy.`)
    }
    levels.set(`${row.curriculum_id}|${row.code}`, row)
  }
  const missingLevels = []
  for (const program of programs) {
    for (const spec of LEVELS) {
      if (!levels.has(`${program.id}|${spec.code}`)) {
        missingLevels.push({
          curriculum_id: program.id,
          code: spec.code,
          name: spec.name,
          sequence_no: spec.sequence,
          level_number: spec.levelNumber,
          level_type: spec.levelType,
          completion_rule: 'ALL_REQUIRED_SUBJECTS',
          status: 'ACTIVE',
        })
      }
    }
  }
  for (const row of await insertChunks(client, 'curriculum_levels', missingLevels, 'id, curriculum_id, code')) {
    levels.set(`${row.curriculum_id}|${row.code}`, row)
  }

  const levelIds = [...levels.values()].map(row => row.id)
  const existingSubjects = await loadAll(() => client.from('curriculum_subjects')
    .select('id, level_id, code, name, family_code, subject_level, sort_order, status, completion_rule')
    .in('level_id', levelIds))
  const subjects = new Map()
  const levelById = new Map([...levels.values()].map(row => [row.id, row]))
  for (const row of existingSubjects) {
    const level = levelById.get(row.level_id)
    const template = SUBJECTS.find(subject => subject.code === row.code)
    const levelSpec = level ? levelSpecs.get(level.code) : null
    const expectedName = template && levelSpec ? subjectName(template.label, levelSpec) : null
    if (!level || !template || row.name !== expectedName || row.status !== 'ACTIVE' || row.completion_rule !== 'ALL_REQUIRED_COMPONENTS') {
      throw new Error(`Existing TEST subject ${row.code} does not match the approved demo hierarchy.`)
    }
    subjects.set(`${row.level_id}|${row.code}`, row)
  }
  const missingSubjects = []
  for (const program of programs) {
    for (const levelSpec of LEVELS) {
      const level = levels.get(`${program.id}|${levelSpec.code}`)
      SUBJECTS.forEach((subject, index) => {
        if (!subjects.has(`${level.id}|${subject.code}`)) {
          missingSubjects.push({
            level_id: level.id,
            family_code: subject.family,
            code: subject.code,
            name: subjectName(subject.label, levelSpec),
            subject_level: levelSpec.levelNumber,
            is_required: true,
            completion_rule: 'ALL_REQUIRED_COMPONENTS',
            sort_order: index + 1,
            status: 'ACTIVE',
          })
        }
      })
    }
  }
  for (const row of await insertChunks(client, 'curriculum_subjects', missingSubjects, 'id, level_id, code')) {
    subjects.set(`${row.level_id}|${row.code}`, row)
  }

  const subjectIds = [...subjects.values()].map(row => row.id)
  const existingComponents = await loadAll(() => client.from('curriculum_subject_components')
    .select('id, subject_id, code, name, status, completion_rule')
    .in('subject_id', subjectIds))
  const components = new Map()
  for (const row of existingComponents) {
    if (row.code !== 'CORE' || row.status !== 'ACTIVE' || row.completion_rule !== 'ALL_REQUIRED_ITEMS') {
      throw new Error('Existing TEST component does not match the approved demo hierarchy.')
    }
    if (components.has(row.subject_id)) throw new Error('A TEST subject owns more than one component.')
    components.set(row.subject_id, row)
  }
  const missingComponents = []
  for (const subject of subjects.values()) {
    if (!components.has(subject.id)) {
      missingComponents.push({
        subject_id: subject.id,
        code: 'CORE',
        name: 'Core',
        is_required: true,
        sort_order: 1,
        completion_rule: 'ALL_REQUIRED_ITEMS',
        status: 'ACTIVE',
      })
    }
  }
  for (const row of await insertChunks(client, 'curriculum_subject_components', missingComponents, 'id, subject_id, code')) {
    components.set(row.subject_id, row)
  }

  const componentIds = [...components.values()].map(row => row.id)
  const existingItems = await loadAll(() => client.from('curriculum_component_items')
    .select('id, component_id, code, status')
    .in('component_id', componentIds))
  const items = new Set(existingItems.map(row => `${row.component_id}|${row.code}`))
  for (const row of existingItems) {
    if (!/^L\d{2}$/.test(row.code) || row.status !== 'ACTIVE') {
      throw new Error('Existing TEST lesson does not match the approved demo hierarchy.')
    }
  }
  const missingItems = []
  for (const subject of subjects.values()) {
    const component = components.get(subject.id)
    for (let number = 1; number <= LESSON_COUNT; number += 1) {
      const code = `L${String(number).padStart(2, '0')}`
      if (!items.has(`${component.id}|${code}`)) {
        missingItems.push({
          component_id: component.id,
          code,
          name: `Lesson ${code.slice(1)}`,
          sort_order: number,
          is_required: true,
          status: 'ACTIVE',
        })
      }
    }
  }
  await insertChunks(client, 'curriculum_component_items', missingItems)

  const counts = await countOwned(client, programIds)
  const expected = plan.counts
  if (counts.programs !== expected.programs || counts.levels !== expected.levels
      || counts.subjects !== expected.subjects || counts.lessons !== expected.lessons
      || counts.components !== expected.components) {
    throw new Error('TEST hierarchy counts do not match the approved demo dataset.')
  }
  const after = await loadAll(() => client.from('curriculums').select('id, code'))
  const nonTestAfter = after.filter(row => !TEST_CODES.includes(row.code)).map(row => row.id).sort()
  if (nonTestAfter.join() !== nonTestBefore.join()) throw new Error('Non-test curriculum data changed.')
  const { count: coursesAfter, error: courseAfterError } = await client.from('courses').select('id', { count: 'exact', head: true })
  if (courseAfterError) throw dbError(courseAfterError)
  if (coursesAfter !== coursesBefore) throw new Error('Course data changed.')
  printCounts(log, counts)
  for (const program of programs) {
    const breakdown = await countOwned(client, [program.id])
    log(`${program.name}: ${breakdown.levels} / ${breakdown.subjects} / ${breakdown.lessons}`)
  }
  return counts
}

async function countOwned(client, programIds) {
  const levels = await loadAll(() => client.from('curriculum_levels').select('id').in('curriculum_id', programIds))
  const levelIds = levels.map(row => row.id)
  const subjects = levelIds.length
    ? await loadAll(() => client.from('curriculum_subjects').select('id').in('level_id', levelIds))
    : []
  const subjectIds = subjects.map(row => row.id)
  const components = subjectIds.length
    ? await loadAll(() => client.from('curriculum_subject_components').select('id').in('subject_id', subjectIds))
    : []
  const componentIds = components.map(row => row.id)
  const lessons = componentIds.length
    ? await loadAll(() => client.from('curriculum_component_items').select('id').in('component_id', componentIds))
    : []
  return {
    programs: programIds.length,
    levels: levels.length,
    subjects: subjects.length,
    components: components.length,
    lessons: lessons.length,
  }
}

async function updateStatus(query) {
  const { error } = await query
  if (error) throw dbError(error)
}

async function retireOwned(client, programIds) {
  await updateStatus(client.from('curriculums').update({ status: 'INACTIVE' }).in('id', programIds).in('code', TEST_CODES))
  const levels = await loadAll(() => client.from('curriculum_levels').select('id').in('curriculum_id', programIds))
  const levelIds = levels.map(row => row.id)
  if (levelIds.length) await updateStatus(client.from('curriculum_levels').update({ status: 'INACTIVE' }).in('id', levelIds))
  const subjects = levelIds.length
    ? await loadAll(() => client.from('curriculum_subjects').select('id').in('level_id', levelIds))
    : []
  const subjectIds = subjects.map(row => row.id)
  if (subjectIds.length) await updateStatus(client.from('curriculum_subjects').update({ status: 'INACTIVE' }).in('id', subjectIds))
  const components = subjectIds.length
    ? await loadAll(() => client.from('curriculum_subject_components').select('id').in('subject_id', subjectIds))
    : []
  const componentIds = components.map(row => row.id)
  if (componentIds.length) await updateStatus(client.from('curriculum_subject_components').update({ status: 'INACTIVE' }).in('id', componentIds))
  for (let index = 0; index < componentIds.length; index += 100) {
    const slice = componentIds.slice(index, index + 100)
    await updateStatus(client.from('curriculum_component_items').update({ status: 'INACTIVE' }).in('component_id', slice))
  }
}

async function cleanup(client, log) {
  const curricula = await loadAll(() => client.from('curriculums').select('id, code'))
  const canonicalIds = new Set(curricula.filter(row => CANONICAL_CODES.includes(row.code)).map(row => row.id))
  const ids = ownedCurriculumIds(curricula)
  if (ids.some(id => canonicalIds.has(id))) throw new Error('Refusing to delete a canonical program.')
  if (!ids.length) {
    printCounts(log, { programs: 0, levels: 0, subjects: 0, components: 0, lessons: 0 })
    return { removed: 0, retired: 0 }
  }
  const { error } = await client.from('curriculums').delete().in('id', ids).in('code', TEST_CODES)
  if (error && error.code === '23503') {
    await retireOwned(client, ids)
    log('Cleanup retired TEST programs because related history blocks deletion.')
    return { removed: 0, retired: ids.length }
  }
  if (error) throw dbError(error)
  const remaining = await loadAll(() => client.from('curriculums').select('id, code').in('code', TEST_CODES))
  if (remaining.length) throw new Error('TEST cleanup did not remove every owned curriculum.')
  log(`Cleanup removed TEST programs: ${ids.length}`)
  printCounts(log, { programs: 0, levels: 0, subjects: 0, components: 0, lessons: 0 })
  return { removed: ids.length, retired: 0 }
}

async function run({ mode, url, key, log = console.log, client, createClientImpl = createClient }) {
  url = localUrl(url)
  if (!key) throw new Error('Local Supabase service-role credential is missing.')
  if (mode === 'dry-run') {
    printCounts(log, buildPlan().counts)
    return buildPlan().counts
  }
  const db = client ?? createClientImpl(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: guardedFetch(url) },
  })
  if (mode === 'cleanup') return cleanup(db, log)
  if (mode !== 'seed') throw new Error('Usage: npm run local:seed-academic-demo -- [--dry-run|--cleanup]')
  return seed(db, log)
}

async function main() {
  const mode = parseArgs(process.argv.slice(2))
  await run({ mode, ...readLocalStatus() })
}

if (require.main === module) main().catch(error => {
  console.error(error.message === REFUSED ? REFUSED : `FAILED: ${error.message}`)
  process.exitCode = 1
})

module.exports = {
  REFUSED, TEST_CODES, CANONICAL_CODES, FORBIDDEN_SUBJECTS, localUrl, guardedFetch, parseArgs, buildPlan,
  missingKeys, ownedCurriculumIds, resolveProgramIdentity, run,
}
