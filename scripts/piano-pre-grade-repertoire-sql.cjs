const fs=require('node:fs')
const path=require('node:path')
const plan=require('../lib/academic/piano-pre-grade-repertoire.json')
function buildSql(){return `create temp table rep_plan(payload jsonb) on commit drop;\ninsert into rep_plan values('${JSON.stringify(plan).replaceAll("'","''")}'::jsonb);\n${fs.readFileSync(path.join(__dirname,'sql/piano-pre-grade-repertoire.sql'),'utf8')}`}
if(require.main===module) fs.writeFileSync(path.join(__dirname,'../supabase/migrations/20261006021000_piano_pre_grade_repertoire_books.sql'),buildSql())
module.exports={buildSql}
