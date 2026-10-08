const fs = require('node:fs')
const path = require('node:path')
const plan = require('../lib/academic/piano-pre-step-book-b.json')
function buildSql() {
  return `create temp table bb_plan(payload jsonb) on commit drop;\ninsert into bb_plan values('${JSON.stringify(plan).replaceAll("'", "''")}'::jsonb);\n${fs.readFileSync(path.join(__dirname, 'sql/piano-pre-step-book-b.sql'), 'utf8')}`
}
if (require.main === module) fs.writeFileSync(path.join(__dirname, '../supabase/migrations/20261006003000_piano_pre_step_book_b.sql'), buildSql())
module.exports = { buildSql }
