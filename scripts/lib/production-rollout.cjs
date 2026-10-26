const crypto = require('node:crypto')

const PROJECT = 'qhznfywwrhmcwbkujclm'
const IMPORT_BATCH = 'b52d8476-7446-5130-abf8-04f0a67c992c'
const SOURCE_SHA = '0c21addfc5e5971a45c635ea2bfacb9b0d4188536f033e26a9e658382c5e5dcc'
const ORIGINAL_SHA = '8ad3a441cb601c7973ad3792e7eaddb29312e403c62b874a5bb8d514be186761'
const text = v => String(v ?? '').normalize('NFC').trim()
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v
const digest = v => crypto.createHash('sha256').update(JSON.stringify(canonical(v)) ?? 'undefined').digest('hex')
const same = (a, b) => digest(a) === digest(b)
const literal = v => v === null ? 'null' : `'${String(v).replaceAll("'", "''")}'`
const json = v => `${literal(JSON.stringify(v))}::jsonb`
const result = (state, reason, extra = {}) => ({ state, reason, ...extra })

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function mappedLevel(label, program, snapshot) {
  const normalized = text(label).toUpperCase().replace(/^GARDE /, 'GRADE ')
  const code = { DRUM: 'DRUMS' }[program] || program
  const curriculum = snapshot.curriculums.filter(c => c.code === code && c.status === 'ACTIVE')
  if (curriculum.length !== 1) return result('HOLD', 'PROGRAM_NOT_MAPPED')
  const match = /^GRADE ([1-8])$/.exec(normalized)
  if (!match) return result('HOLD', normalized ? 'PRE_SEGMENT_MAPPING_REQUIRED' : 'LEVEL_F_MISSING')
  const levels = snapshot.levels.filter(l => l.curriculum_id === curriculum[0].id && l.code === `GRADE_${match[1]}` && l.status === 'ACTIVE')
  if (levels.length !== 1) return result('HOLD', 'TARGET_LEVEL_NOT_UNIQUE')
  return result('READY', 'EXACT_ACTIVE_GRADE', { curriculum_id: curriculum[0].id, level_id: levels[0].id, level_code: levels[0].code, normalized })
}

function buildPlan(source, snapshot, deploymentId, context = {}) {
  if (source.source_sha256 !== SOURCE_SHA || source.original_sha256 !== ORIGINAL_SHA) throw Error('SOURCE_VERSION_NOT_REVIEWED')
  if (source.records.length !== 111 || new Set(source.records.map(r => r.source_excel_row)).size !== 111) throw Error('SOURCE_ROW_CONTRACT_CHANGED')
  if (snapshot.branches.length !== 1 || snapshot.branches[0].code !== 'CT01') throw Error('TARGET_BRANCH_NOT_UNIQUE')
  const batch = snapshot.opening_batches.find(b => b.import_batch_id === IMPORT_BATCH && b.source_sha256 === ORIGINAL_SHA)
  if (!batch) throw Error('IMPORT_LEDGER_SOURCE_MISMATCH')
  const rows = [], actions = []
  for (const sourceRow of source.records) {
    const raw = sourceRow.raw, number = sourceRow.source_excel_row
    const found = snapshot.opening_rows.filter(r => r.source_reference === sourceRow.original_reference && r.source_excel_row === number)
    const before = found.length === 1 ? found[0] : null
    const record = { source_excel_row: number, source_reference: sourceRow.original_reference,
      full_name: raw.full_name, source_program: raw.curriculum_code, level_f: raw.Column1,
      source_fee_start: raw['start date'], source_fee_end: raw['end date'],
      student_id: before?.target_student_id ?? null, opening_row_id: before?.id ?? null,
      academic_start: null, schedule_start: null, tuition_period_id: null }
    const identityOk = sourceRow.matches_original_identity && before &&
      ['full_name','date_of_birth','phone','curriculum_code','legacy_reference'].every(k =>
        text(sourceRow.original_raw[k]) === text(before.raw_payload[k]))
    if (!identityOk) {
      const reason = before ? 'SOURCE_IDENTITY_CHANGED' : 'NO_VERIFIED_IMPORT_REFERENCE'
      for (const part of ['tuition_date_action','academic_action','schedule_action','reference_action']) record[part] = result('HOLD', reason)
      rows.push(record); continue
    }
    if (before.disposition === 'EXCLUDED' || number === 60) {
      for (const part of ['tuition_date_action','academic_action','schedule_action','reference_action']) record[part] = result('EXCLUDED', 'OWNER_EXCLUDED')
      rows.push(record); continue
    }
    const program = text(raw.curriculum_code).toUpperCase()
    if (text(raw.instrument_or_program).toUpperCase() !== program) throw Error(`PROGRAM_COLUMNS_DISAGREE:${number}`)
    const grade = mappedLevel(raw.Column1, program, snapshot)
    record.level_mapping = grade
    const patch = {}, payload = { ...before.normalized_payload }
    const changes = []
    const start = raw['start date'], end = raw['end date']
    const datesOk = validDate(start) && validDate(end) && end > start
    if (datesOk) {
      if (before.fee_starts_on !== start || before.source_effective_ends_on !== end) {
        patch.fee_starts_on = start
        patch.source_effective_ends_on = end
        payload.fee_starts_on = start
        payload.source_effective_ends_on = end
        patch.date_state = 'CONFLICT'
        patch.term_state = 'PENDING_REVIEW'
        payload.date_state = 'CONFLICT'
        payload.term_state = 'PENDING_REVIEW'
        changes.push('reference_fee_dates')
      }
      // A reference period is not an operational paid entitlement. Do not create it.
      record.tuition_date_action = result('HOLD', 'OPERATIONAL_TUITION_PERIOD_NOT_CREATED', { reference_dates: changes.includes('reference_fee_dates') ? 'READY' : 'ALREADY_APPLIED' })
    } else {
      record.tuition_date_action = result('HOLD', before.is_unlimited && !start && !end
        ? 'UNLIMITED_REFERENCE_PRESERVED_NO_OPERATIONAL_PERIOD'
        : !start && !end ? 'FEE_DATES_NOT_PROVIDED' : 'FEE_DATE_PAIR_INVALID')
    }
    if (grade.state === 'READY') {
      if (before.level_id !== grade.level_id || before.curriculum_id !== grade.curriculum_id || text(payload.original_grade) !== grade.normalized) {
        patch.level_id = grade.level_id
        patch.curriculum_id = grade.curriculum_id
        patch.program_state = 'MAPPED_AWAITING_ACADEMIC_START'
        payload.original_grade = grade.normalized
        payload.grade = Number(grade.normalized.slice(-1))
        payload.level_code = grade.level_code
        payload.curriculum_code = program === 'DRUM' ? 'DRUMS' : program
        changes.push('reference_level_label')
        if (before.level_id !== grade.level_id) changes.push('reference_level_id')
      }
      const existing = snapshot.academic_enrollments.filter(e => e.student_id === before.target_student_id && e.curriculum_id === grade.curriculum_id && e.status !== 'CANCELLED')
      if (existing.length === 1 && existing[0].current_level_id === grade.level_id) {
        record.academic_start = existing[0].started_at
        record.academic_action = result('ALREADY_APPLIED', 'EXISTING_ACADEMIC_LEVEL_MATCHES', { enrollment_id: existing[0].id })
      } else record.academic_action = result('HOLD', existing.length ? 'ACADEMIC_BASELINE_CORRECTION_REQUIRES_REVIEW' : 'ACADEMIC_START_NOT_PROVIDED')
    } else record.academic_action = grade
    record.schedule_action = result('HOLD', number === 94 || ['PAUSED','CANCELLED'].includes(raw.tuition_status)
      ? 'OPERATING_STATUS_REQUIRES_REVIEW' : 'SCHEDULE_START_AND_CONFIRMED_ROSTER_REQUIRED')
    if (changes.length) {
      payload.owner_update_source = { sha256: SOURCE_SHA, excel_row: number, level_column: 'F', original_level_f: raw.Column1, fee_columns: ['P','Q'] }
      patch.normalized_payload = payload
      const after = { ...before, ...patch }
      const action = { key: `reference:${before.id}`, kind: 'UPDATE_REFERENCE', target_id: before.id,
        source_excel_row: number, student_id: before.target_student_id,
        changes, before, after, before_hash: digest(before), after_hash: digest(after) }
      actions.push(action)
      record.reference_action = result('READY', 'SOURCE_REFERENCE_CORRECTION_ONLY', { changes, action_key: action.key })
    } else record.reference_action = result(grade.state === 'HOLD' && raw.Column1 ? 'HOLD' : 'ALREADY_APPLIED',
      grade.state === 'HOLD' && raw.Column1 ? grade.reason : 'NO_REFERENCE_DELTA')
    rows.push(record)
  }
  const summary = {}
  for (const part of ['reference_action','tuition_date_action','academic_action','schedule_action']) {
    summary[part] = rows.reduce((s,r) => { const k=r[part].state; s[k]=(s[k]||0)+1; return s },{})
  }
  const names = ['Piano 1','Piano 2','Guitar 1','Guitar 2','Violin 1','Violin 2']
  const rooms = names.map(name => {
    const found = snapshot.rooms.filter(r => r.name === name && r.status === 'ACTIVE' && r.capacity === 6 && !r.code.startsWith('TEST'))
    return { name, state: found.length === 1 ? 'ALREADY_APPLIED' : 'HOLD', reason: found.length === 1 ? 'EXISTING_APPROVED_ROOM' : 'ROOM_RECONCILIATION_REQUIRED', id: found.length === 1 ? found[0].id : null }
  })
  const plan = { version: 1, batch_key: `ct-owner-update:${SOURCE_SHA}`, source_sha256: SOURCE_SHA,
    source_file: source.source_file, original_file: source.original_file,
    original_sha256: ORIGINAL_SHA, project_ref: PROJECT, import_batch_id: IMPORT_BATCH,
    deployment_id: deploymentId, branch_id: snapshot.branches[0].id,
    snapshot_observed_at: snapshot.observed_at, snapshot_hash: digest(snapshot),
    summary, rooms, rows, actions, side_effect_counts: snapshot.side_effect_counts,
    status: 'PARTIAL_WITH_HOLDS' }
  if (context.approval) require('./production-rollout-schedule.cjs').enrichPlan(plan, source, snapshot, context)
  plan.plan_hash = digest(plan)
  return plan
}

module.exports = { PROJECT, IMPORT_BATCH, SOURCE_SHA, ORIGINAL_SHA, text, canonical, digest, same, literal, json, validDate, mappedLevel, buildPlan }
