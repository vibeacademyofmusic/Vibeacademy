const fs = require('node:fs')
const path = require('node:path')
const { buildPlan } = require('../lib/academic/guitar-pre-werner.cjs')

const root = path.resolve(__dirname, '..')

function buildFunctionSql() {
  const template = fs.readFileSync(path.join(__dirname, 'sql/guitar-pre-werner.sql'), 'utf8')
  if (!template.includes('__PLAN_JSON__')) throw new Error('Guitar Werner SQL template is missing the plan placeholder')
  const payload = JSON.stringify(buildPlan())
  if (payload.includes('$plan$')) throw new Error('Lesson plan cannot contain the SQL delimiter')
  return template.replace('__PLAN_JSON__', payload)
}

function buildMigration() {
  return `-- Guitar Pre Grade: Classical Guitar Method Volumes 1 and 2.
-- Renames the existing method and repertoire subjects when that catalog is already present.
-- A database without GUITAR keeps this function and does not invent a second program.
${buildFunctionSql().trimEnd()}
`
}

module.exports = { buildFunctionSql, buildMigration }

if (require.main === module) {
  const target = path.join(root, 'supabase/migrations/20261006040000_guitar_pre_grade_werner_volumes.sql')
  fs.writeFileSync(target, buildMigration())
}
