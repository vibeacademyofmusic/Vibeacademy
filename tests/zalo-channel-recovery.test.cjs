const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict'),test=require('node:test')
test('local channel recovery: late consent, full payment, gate and duplicate protections (rollback)',()=>{
 const output=execFileSync('docker',['exec','-i','supabase_db_vibe-academy-system','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:fs.readFileSync('supabase/tests/database/zalo_channel_recovery_test.sql','utf8'),encoding:'utf8'})
 assert.doesNotMatch(output,/(^|\n)not ok|Looks like you/)
 assert.match(output,/ok 21 - delivered protected/)
})
