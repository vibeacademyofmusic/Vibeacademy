'use strict'

const { spawnSync } = require('node:child_process')

const BUTTONS = new Set(['Tiếp tục học', 'Dừng học', 'Yêu cầu khác', 'Liên hệ', 'Liên Hệ', 'Tiếp Tục Học'])
const ID = /^[A-Za-z0-9_-]{1,80}$/
const OA = /^[0-9]{8,32}$/
const MS = /^[0-9]{13}$/

function ssh(host, key, remote) {
  const result = spawnSync('ssh', [
    '-i', key,
    '-o', 'IdentitiesOnly=yes',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=8',
    `root@${host}`,
    remote,
  ], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error('gateway ssh failed')
  return result.stdout
}

function remoteNode(host, key, source) {
  const encoded = Buffer.from(source, 'utf8').toString('base64')
  return ssh(host, key, `echo ${encoded} | base64 -d | sudo -u vibe-zalo node`)
}

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function applySql(sql) {
  const result = spawnSync('docker', [
    'exec', '-i', 'supabase_db_vibe-academy-system',
    'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA',
  ], { input: sql, encoding: 'utf8' })
  if (result.status !== 0) throw new Error('gateway apply failed')
  return result.stdout.trim()
}

function pendingEvents(host, key) {
  const stdout = remoteNode(host, key, `
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('/var/lib/vibe-zalo-gateway/events.db');
const rows=db.prepare("select id, event_type, payload from webhook_events where outcome='unknown_tracking' and payload is not null order by id").all();
for (const row of rows) {
  const body=JSON.parse(row.payload);
  const message=body.message&&typeof body.message==='object'?body.message:{};
  process.stdout.write(JSON.stringify({id:row.id,event_type:row.event_type,msg_id:body.msg_id||message.msg_id,tracking_id:message.tracking_id,button:message.data,submit_time:message.submit_time,delivery_time:message.delivery_time,oa_id:body.oa_id})+'\\n');
}
`)
  return stdout.split('\n').filter(Boolean).map(line => JSON.parse(line))
}

function markTerminal(host, key, id, outcome) {
  const eventId = Number(id)
  const stored = outcome === 'ignored' ? 'ignored' : 'recorded'
  if (!Number.isInteger(eventId)) return
  remoteNode(host, key, `
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('/var/lib/vibe-zalo-gateway/events.db');
db.prepare("update webhook_events set outcome='${stored}', processed_at=? where id=? and outcome='unknown_tracking'").run(new Date().toISOString(), ${eventId});
`)
}

function applyGatewayClicks(env = process.env) {
  const host = env.ZALO_GATEWAY_SSH_HOST?.trim()
  const key = env.ZALO_GATEWAY_SSH_KEY?.trim()
  if (!host || !key || !/^[0-9.]+$/.test(host)) return { applied: 0, skipped: true }
  let applied = 0
  for (const event of pendingEvents(host, key)) {
    if (!Number.isInteger(event.id)) continue
    const messageId = event.msg_id
    const trackingId = event.tracking_id
    const oaId = event.oa_id
    if (!ID.test(messageId || '') || !ID.test(trackingId || '')) {
      markTerminal(host, key, event.id, 'ignored')
      console.info(JSON.stringify({ component: 'zalo_gateway_apply', eventId: event.id, eventType: event.event_type, outcome: 'invalid_correlation' }))
      continue
    }
    let outcome = 'skipped'
    if (event.event_type === 'user_click_response_button' && BUTTONS.has(event.button) && MS.test(String(event.submit_time || '')) && OA.test(oaId || '')) {
      const button = event.button === 'Liên hệ' || event.button === 'Liên Hệ' ? 'Yêu cầu khác' : event.button === 'Tiếp Tục Học' ? 'Tiếp tục học' : event.button
      outcome = applySql(`select public.record_tuition_zalo_reply('Zalo ZBS', ${quote(trackingId)}, ${quote(messageId)}, ${quote(button)}, ${quote(event.submit_time)}, ${quote(oaId)});`)
    } else if (event.event_type === 'user_received_message' && MS.test(String(event.delivery_time || ''))) {
      outcome = applySql(`select public.note_tuition_zalo_delivery(${quote(trackingId)}, ${quote(messageId)}, ${quote(event.delivery_time)});`)
    }
    if (['recorded', 'duplicate', 'conflict', 'DELIVERED', 'IDEMPOTENT', 'IGNORED'].includes(outcome)) {
      markTerminal(host, key, event.id, outcome === 'IGNORED' ? 'ignored' : 'recorded')
      applied += 1
    }
    console.info(JSON.stringify({ component: 'zalo_gateway_apply', eventId: event.id, eventType: event.event_type, outcome }))
  }
  return { applied }
}

if (require.main === module) {
  const run = () => {
    try {
      const result = applyGatewayClicks()
      console.info(JSON.stringify({ component: 'zalo_gateway_apply', ...result }))
    } catch (error) {
      console.error(JSON.stringify({ component: 'zalo_gateway_apply', outcome: 'failed', reason: error instanceof Error ? error.message : 'error' }))
    }
  }
  run()
  const interval = Number(process.env.ZALO_GATEWAY_APPLY_INTERVAL_MS || 0)
  if (interval >= 15000) setInterval(run, interval)
}

module.exports = { applyGatewayClicks }
