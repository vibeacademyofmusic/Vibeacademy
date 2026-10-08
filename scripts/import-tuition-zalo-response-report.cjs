const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')
require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), true, { info() {}, error() {} })

const EXPECTED_SHA = 'fbfdaeb1ede5bf5d4cfea93b29347bf5aae3a12dc743da4ed9403599ec4ebdc4'
const DELIVERY_MS = 1790760025998
const SOURCE = process.argv[2] || '/Users/macbookair/Downloads/ReportResponseTemplate_643118.xlsx'

function wallClock(ms) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const value = (type) => parts.find((part) => part.type === type).value
  return `${value('hour')}:${value('minute')}:${value('second')} ${value('day')}/${value('month')}/${value('year')}`
}

function readSheet(file) {
  const shared = execFileSync('python3', ['-c', `
import json, zipfile
from xml.etree import ElementTree as ET
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
z=zipfile.ZipFile(${JSON.stringify(file)})
ss=[]
root=ET.fromstring(z.read('xl/sharedStrings.xml'))
for si in root.findall('m:si', ns):
    ss.append(''.join(t.text or '' for t in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')))
sheet=ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
rows=[]
for row in sheet.findall('m:sheetData/m:row', ns):
    values=[]
    for cell in row.findall('m:c', ns):
        kind=cell.attrib.get('t')
        node=cell.find('m:v', ns)
        text=node.text if node is not None else ''
        if kind=='s':
            text=ss[int(text)]
        values.append(text)
    rows.append(values)
wb=ET.fromstring(z.read('xl/workbook.xml'))
name=wb.find('m:sheets/m:sheet', ns).attrib['name']
print(json.dumps({'sheet': name, 'rows': rows}))
`])
  return JSON.parse(shared.toString('utf8'))
}

function sql(statement) {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_vibe-academy-system', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], {
    input: statement,
    encoding: 'utf8',
  }).trim()
}

async function main() {
  const bytes = fs.readFileSync(SOURCE)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== EXPECTED_SHA) throw new Error('SHA_MISMATCH')
  const workbook = readSheet(SOURCE)
  if (workbook.sheet !== 'Sheet 1' || workbook.rows.length !== 2) throw new Error('SHEET_SHAPE')
  const [header, row] = workbook.rows
  if (header.join('|') !== 'STT|tracking_id|message_id|submit_time|Method|Response(Data)') throw new Error('HEADER')
  const [, trackingId, messageId, submitRaw, method, response] = row
  const deliveryWall = wallClock(DELIVERY_MS)
  if (!deliveryWall.startsWith('16:20:') || !deliveryWall.endsWith('30/09/2026')) throw new Error('DELIVERY_CLOCK')
  const reportInstant = Date.parse(`${submitRaw.slice(15, 19)}-${submitRaw.slice(12, 14)}-${submitRaw.slice(9, 11)}T${submitRaw.slice(0, 8)}+07:00`)
  if (!Number.isFinite(reportInstant) || reportInstant <= DELIVERY_MS || reportInstant - DELIVERY_MS > 10 * 60 * 1000) throw new Error('REPORT_CLOCK')
  const env = process.env
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const before = sql(`select z.send_status, r.status, e.status, (select count(*) from tuition_zalo_replies q where q.tracking_id=z.tracking_id), (select count(*) from payments p where p.student_id_snapshot=z.student_id) from tuition_zalo_sends z join tuition_reminders r on r.id=z.reminder_id join enrollments e on e.student_id=z.student_id and e.status='ACTIVE' where z.tracking_id='${trackingId}' and z.provider_message_id='${messageId}'`)
  const actor = sql(`select account.id from auth.users account join public.profiles profile on profile.id=account.id join public.user_roles assignment on assignment.user_id=account.id join public.roles role on role.id=assignment.role_id where account.email='admin@vibe.local' and role.code='SUPER_ADMIN' and assignment.branch_id is null and assignment.is_active and profile.status='ACTIVE'`)
  const args = {
    p_filename: path.basename(SOURCE),
    p_sha256: sha256,
    p_sheet: workbook.sheet,
    p_row: 2,
    p_template_id: '643118',
    p_app_id: env.ZALO_APP_ID.trim(),
    p_oa_id: env.ZALO_OA_ID.trim(),
    p_student_code: 'TEST-ZALO-HP',
    p_tracking_id: trackingId,
    p_message_id: messageId,
    p_submit_time_raw: submitRaw,
    p_method: method,
    p_response: response,
    p_actor: actor,
  }
  const first = await db.rpc('import_tuition_zalo_response_report', args)
  const second = await db.rpc('import_tuition_zalo_response_report', args)
  const after = sql(`select z.send_status, r.status, e.status, q.button_data, q.source, q.submit_time, i.filename, i.sha256, i.sheet, i.sheet_row, i.submit_time_raw, i.submit_timezone, i.result, (select count(*) from tuition_zalo_replies c where c.tracking_id=z.tracking_id), (select count(*) from payments p where p.student_id_snapshot=z.student_id) from tuition_zalo_sends z join tuition_reminders r on r.id=z.reminder_id join enrollments e on e.student_id=z.student_id and e.status='ACTIVE' join tuition_zalo_replies q on q.send_id=z.id join tuition_zalo_reply_imports i on i.reply_id=q.id where z.tracking_id='${trackingId}'`)
  if (first.error || second.error) throw new Error('IMPORT_FAILED')
  console.log(JSON.stringify({
    sha256,
    sheet: workbook.sheet,
    row: 2,
    trackingId,
    messageId,
    response,
    submitRaw,
    timezone: 'Asia/Ho_Chi_Minh',
    deliveryWall,
    before,
    first: first.data,
    second: second.data,
    after,
  }))
}

main().catch((error) => {
  console.error(JSON.stringify({ result: error.message || 'IMPORT_FAILED' }))
  process.exitCode = 1
})
