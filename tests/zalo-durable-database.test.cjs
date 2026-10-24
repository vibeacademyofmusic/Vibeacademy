const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict'),test=require('node:test')
test('main local PostgreSQL: payment, durable recovery and permissions (rolled back)',()=>{
 const output=execFileSync('docker',['exec','-i','supabase_db_vibe-academy-system','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:fs.readFileSync('supabase/tests/database/zalo_durable_recovery_test.sql','utf8'),encoding:'utf8'})
 assert.doesNotMatch(output,/(^|\n)not ok|Looks like you/)
 assert.match(output,/ok 42 - anonymous cannot retry/)
})
