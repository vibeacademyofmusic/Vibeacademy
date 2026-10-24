const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { root, snapshot } = require('./helpers/report-runtime.cjs')
// Optional isolated PostgreSQL runtime, explicitly supplied; normal tests never contact a DB.
const runtime = process.env.REPORT_TEST_PGLITE_MODULE
const sqlFile = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8')
const functionSql = (source, name) => {
  const start = source.search(new RegExp('create (?:or replace )?function ' + name.replaceAll('.', '\\.') + '\\(', 'i'))
  assert.ok(start >= 0, name)
  return source.slice(start, source.indexOf('$$;', start) + 3)
}

test('isolated PostgreSQL: publication, bearer access, eligibility and durable attempts', { skip: !runtime }, async t => {
  const { PGlite } = require(runtime); const db = new PGlite()
  const call = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as result`, args)).rows[0].result
  try {
    await db.exec(fs.readFileSync(path.join(root, 'tests/fixtures/learning-report-schema.sql'), 'utf8'))
    const base = sqlFile('20260916210000_notification_infrastructure.sql')
    await db.exec(base.slice(0, base.indexOf('alter table public.notification_jobs enable')))
    const outbound = sqlFile('20260923050000_notification_zalo_outbound_v1.sql')
    await db.exec(outbound.slice(0, outbound.indexOf('create policy notification_branch_read')))
    // Apply the actual final sent_at invariant, without unrelated registration migrations.
    await db.exec(`alter table notification_jobs drop constraint notification_jobs_check;
      alter table notification_jobs add check ((status in ('SENT','DELIVERED'))=(sent_at is not null));
      create table notification_private.zalo_credentials(app_id text,oa_id text,version bigint,state text,expires_at timestamptz);`)
    await db.exec(functionSql(outbound, 'notification_private.active_zalo_links'))
    const consolidated = sqlFile('20260928030000_consolidate_zalo_durable_outbox.sql')
    await db.exec(functionSql(consolidated, 'notification_private.domain_notice_source'))
    await db.exec(functionSql(consolidated, 'public.enqueue_domain_notification'))
    await db.exec(functionSql(outbound, 'notification_private.emit_domain_event'))
    await db.exec('create trigger notification_report_published after update of status on learning_reports for each row execute function notification_private.emit_domain_event()')
    await db.exec(functionSql(sqlFile('20260928200000_academic_family_communications.sql'), 'public.public_report_snapshot'))
    await db.exec(sqlFile('20261006080000_learning_report_public_pdf_zbs.sql'))
    const owner = '00000000-0000-4000-8000-000000000001', parent = '00000000-0000-4000-8000-000000000002', student = '00000000-0000-4000-8000-000000000003', profile = '00000000-0000-4000-8000-000000000004', branch = '00000000-0000-4000-8000-000000000005', link = '00000000-0000-4000-8000-000000000006'
    await db.query("select set_config('test.actor',$1,false),set_config('test.owner','yes',false)", [owner])
    await db.query('insert into auth.users values($1)', [owner]); await db.query("insert into profiles values($1,'Phụ huynh thử','ACTIVE')", [profile])
    await db.query("insert into parents values($1,$2,'ACTIVE')", [parent, profile]); await db.query("insert into students values($1,'Học viên kiểm thử')", [student]); await db.query('insert into branches values($1)', [branch])
    await db.query('insert into student_parents values($1,$2,true,true,null,null)', [parent, student])
    await db.query("insert into customer_channel_links(id,provider,provider_user_id,parent_id,status,linked_at,consent_at) values($1,'ZALO','333333333',$2,'ACTIVE',now(),now())", [link, parent])
    await db.exec("insert into notification_private.zalo_credentials values('111111111','222222222',1,'READY',now()+interval '1 hour')")
    const publish = async () => {
      const report = crypto.randomUUID()
      await db.query("insert into learning_reports values($1,$2,$3,'APPROVED',2,'MONTHLY','2026-09-01','2026-09-30',$4,now(),$5)", [report, student, branch, JSON.stringify(snapshot), owner])
      assert.equal((await db.query('select count(*)::int n from notification_private.learning_report_links where report_id=$1', [report])).rows[0].n, 0)
      await db.query("update learning_reports set status='PUBLISHED' where id=$1", [report])
      const job = (await db.query('select * from notification_jobs where entity_id=$1', [report])).rows[0]
      const info = await call('learning_report_link_manage', [report, 'READ'])
      return { report, job, token: info.path.split('/')[3] }
    }
    let first
    await t.test('publication and both emitters create one link and one outbox job, no bearer token in readable payload', async () => {
      first = await publish()
      const jobs = await db.query('select * from notification_jobs where entity_id=$1', [first.report]); assert.equal(jobs.rows.length, 1)
      assert.equal(first.job.status, 'QUEUED'); assert.doesNotMatch(JSON.stringify(first.job.payload), new RegExp(first.token))
      assert.equal(await call('enqueue_domain_notification', ['LEARNING_REPORT_PUBLISHED', first.report]), 0)
      const claim = await call('claim_learning_report_pdf', [first.report])
      assert.equal(claim.state, 'CLAIMED'); assert.equal(claim.document.snapshot.admin_note, undefined)
      assert.equal((await call('claim_learning_report_pdf', [first.report])).state, 'BUSY')
      assert.equal(await call('finish_learning_report_pdf', [first.report, claim.lease, 'a'.repeat(64), 1234]), true)
      assert.equal((await call('claim_learning_report_pdf', [first.report])).state, 'READY')
      assert.equal((await call('resolve_learning_report_pdf', [first.token])).state, 'READY')
    })
    await t.test('anon cannot invoke resolver, non-owner cannot mint links; service role can resolve but not read private tables', async () => {
      await db.exec('set role anon'); await assert.rejects(() => call('resolve_learning_report_pdf', [first.token]), /permission denied/); await db.exec('reset role')
      await db.exec("select set_config('test.owner','no',false)")
      await assert.rejects(() => call('learning_report_link_manage', [first.report, 'CREATE']), /Unauthorized/)
      await db.exec("select set_config('test.owner','yes',false); set role service_role")
      assert.equal((await call('resolve_learning_report_pdf', [first.token])).state, 'READY')
      await assert.rejects(() => db.query('select * from notification_private.learning_report_links'), /permission denied/)
      await db.exec('reset role')
    })
    await t.test('unapproved template, expired relation, mismatched branch and credential prevent sending', async () => {
      assert.equal((await call('prepare_learning_report_zbs', [first.job.id])).state, 'REPORT_TEMPLATE_NOT_READY')
      await db.exec("update notification_templates set status='APPROVED',enabled=true,provider_template_id='999999' where template_key='ZALO_LEARNING_REPORT_PUBLISHED'")
      const ready = await call('prepare_learning_report_zbs', [first.job.id]); assert.equal(ready.state, 'READY'); assert.equal(ready.parameters.customer_name, 'Phụ huynh thử')
      await db.exec("update student_parents set valid_until=now()-interval '1 second'")
      assert.equal((await call('prepare_learning_report_zbs', [first.job.id])).state, 'REPORT_RECIPIENT_INELIGIBLE')
      await db.exec('update student_parents set valid_until=null')
      await db.query('update notification_jobs set branch_id=null where id=$1', [first.job.id])
      assert.equal((await call('prepare_learning_report_zbs', [first.job.id])).state, 'REPORT_RECIPIENT_INELIGIBLE')
      await db.query('update notification_jobs set branch_id=$1 where id=$2', [branch, first.job.id])
      assert.equal(await call('claim_learning_report_zbs', [first.job.id, 'wrong-app', '222222222', 1, '999999']), null)
    })
    await t.test('accepted attempts are idempotent and conflicting finish or duplicate claim cannot resend', async () => {
      const args = [first.job.id, '111111111', '222222222', 1, '999999']
      const claimed = await call('claim_learning_report_zbs', args); assert.ok(claimed.attempt_id)
      assert.equal(await call('claim_learning_report_zbs', args), null)
      assert.equal(await call('finish_learning_report_zbs', [claimed.attempt_id, 'ACCEPTED', 'actual-test-receipt', null]), 'ACCEPTED')
      assert.equal(await call('finish_learning_report_zbs', [claimed.attempt_id, 'ACCEPTED', 'actual-test-receipt', null]), 'ACCEPTED')
      await assert.rejects(() => call('finish_learning_report_zbs', [claimed.attempt_id, 'ACCEPTED', 'conflict', null]), /Conflicting/)
      assert.equal(await call('claim_learning_report_zbs', args), null)
      const saved = (await db.query('select * from notification_jobs where id=$1', [first.job.id])).rows[0]
      assert.equal(saved.status, 'SENT'); assert.equal(saved.attempts, 1); assert.equal(saved.delivered_at, null)
    })
    await t.test('interrupted attempt becomes UNKNOWN and is excluded from retries, even if job status is reset', async () => {
      const next = await publish(); const pdf = await call('claim_learning_report_pdf', [next.report]); await call('finish_learning_report_pdf', [next.report, pdf.lease, 'b'.repeat(64), 1234])
      const args = [next.job.id, '111111111', '222222222', 1, '999999']; const claim = await call('claim_learning_report_zbs', args)
      await db.query("update notification_private.learning_report_send_attempts set created_at=now()-interval '6 minutes' where id=$1", [claim.attempt_id])
      assert.equal(await call('reconcile_learning_report_attempts'), 1)
      assert.equal((await call('learning_report_delivery_work', [10])).jobs.includes(next.job.id), false)
      await db.query("update notification_jobs set status='QUEUED' where id=$1", [next.job.id]); assert.equal(await call('claim_learning_report_zbs', args), null)
    })
    await t.test('revocation prevents access and sending; repeated CREATE never reopens a revoked link', async () => {
      await call('note_learning_report_pdf_request', [first.token])
      assert.equal((await call('learning_report_link_manage', [first.report, 'READ'])).request_count, 1)
      await call('learning_report_link_manage', [first.report, 'REVOKE'])
      assert.equal(await call('resolve_learning_report_pdf', [first.token]), null)
      assert.equal((await call('learning_report_link_manage', [first.report, 'CREATE'])).path, null)
      assert.equal((await call('prepare_learning_report_zbs', [first.job.id])).state, 'REPORT_RECIPIENT_INELIGIBLE')
    })
  } finally { await db.close() }
})
