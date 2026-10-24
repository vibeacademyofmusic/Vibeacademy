const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '../..')
function load(file, overrides = {}, cache = new Map()) {
  file = path.resolve(root, file)
  if (cache.has(file)) return cache.get(file)
  const m = { exports: {} }; cache.set(file, m.exports)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const resolve = id => {
    if (Object.hasOwn(overrides, id)) return overrides[id]
    if (id === 'server-only') return {}
    if (!id.startsWith('.') && !id.startsWith('@/')) return require(id)
    const base = id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(path.dirname(file), id)
    const target = [base + '.ts', base + '.tsx', path.join(base, 'index.tsx')].find(fs.existsSync)
    if (!target) throw Error('Test module missing: ' + id)
    return load(target, overrides, cache)
  }
  new Function('module', 'exports', 'require', code)(m, m.exports, resolve)
  return m.exports
}
const snapshot = {
  as_of: '2026-10-05T10:00:00Z', period_start: '2026-09-01', period_end: '2026-09-30', class_name: 'Piano thử nghiệm',
  student: { name: 'Học viên kiểm thử', code: 'REPORT-TEST' }, branch: { name: 'VIBE Cần Thơ' }, teachers: [],
  academic: { curriculum: 'Piano', current_grade: 'Grade 1', status: 'ACTIVE', subjects: [] },
  attendance: { scheduled: 8, attended: 7, absent: 1, excused: 0, unmarked: 0, makeup: 0, rate: 87.5 },
  journals: { count: 1, excerpts: [{ content: 'Luyện tập tiết tấu', homework: 'Ôn bài ở nhà' }] },
  teacher_summary: { achievement: 'Giữ nhịp đều hơn', next_month_plan: 'Luyện phối hợp hai tay' }, admin_note: 'INTERNAL_SECRET_NEVER_RENDER',
}
module.exports = { load, root, snapshot }
