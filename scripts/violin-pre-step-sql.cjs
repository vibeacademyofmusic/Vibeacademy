const fs = require('node:fs')
const path = require('node:path')
const { buildPlan } = require('../lib/academic/violin-pre-step.cjs')

function buildSql() {
  const plan = JSON.stringify(buildPlan()).replaceAll("'", "''")
  if (plan.includes('$violin_apply$') || plan.includes('$violin_gate$')) throw new Error('plan collides with SQL delimiter')
  const body = fs.readFileSync(path.join(__dirname, 'sql/violin-pre-step.sql'), 'utf8')
  return `${body}\nselect public.apply_violin_pre_step_fiddle_time_v1('${plan}'::jsonb);\n`
}

if (require.main === module) {
  const target = path.join(__dirname, '../supabase/migrations/20261007030000_violin_pre_step_fiddle_time.sql')
  fs.writeFileSync(target, buildSql())
}

module.exports = { buildSql }
