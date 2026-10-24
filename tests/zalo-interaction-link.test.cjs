const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const widget = fs.readFileSync('app/admin/business/registrations/[id]/ZaloConnection.tsx', 'utf8')
const page = fs.readFileSync('app/admin/business/registrations/[id]/page.tsx', 'utf8')
const route = fs.readFileSync('app/api/integrations/zalo/webhook/route.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260923040000_zalo_interaction_link_v1.sql', 'utf8')
const publicSource = fs.readFileSync('lib/integrations/zalo/widget-public.ts', 'utf8')
const transpiled = ts.transpileModule(publicSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const loaded = { exports: {} }
new Function('module', 'exports', 'require', transpiled)(loaded, loaded.exports, require)

test('widget uses the official public identifiers and no secret', () => {
  assert.match(widget, /data-oaid=\{ZALO_PUBLIC_OA_ID\}/)
  assert.match(widget, /data-appid=\{ZALO_PUBLIC_APP_ID\}/)
  assert.match(widget, /data-user-external-id=\{connection\.external_link_key/)
  assert.match(widget, /data-callback=\{ZALO_WIDGET_CALLBACK\}/)
  assert.match(publicSource, /1355275380325944240/)
  assert.match(publicSource, /4520912928458797082/)
  assert.equal(widget.includes('ZALO_OA_SECRET_KEY'), false)
  assert.equal(widget.includes('ZALO_OA_ACCESS_TOKEN'), false)
  assert.equal(widget.includes('ZALO_OA_REFRESH_TOKEN'), false)
  assert.equal(widget.includes('ZALO_APP_SECRET'), false)
  assert.equal(page.includes('parent_phone'), true)
  assert.equal(widget.includes('parent_phone'), false)
})

test('callback cannot mark a channel active', () => {
  assert.equal(loaded.exports.zaloCallbackCanActivate('click_interaction_accepted'), false)
  assert.equal(loaded.exports.zaloCallbackCanActivate('loaded_successfully'), false)
  assert.equal(widget.includes("status = 'ACTIVE'"), false)
  assert.equal(widget.includes('link_customer_channel'), false)
  assert.equal(widget.includes('customer_channel_links'), false)
  assert.match(widget, /Kiểm tra trạng thái/)
  assert.match(widget, /CHƯA KẾT NỐI/)
  assert.match(widget, /ĐANG CHỜ XÁC NHẬN/)
  assert.match(widget, /ĐÃ KẾT NỐI/)
})

test('verified interaction webhook is the activation path', () => {
  assert.match(route, /apply_zalo_interaction_event/)
  assert.match(route, /widget_interaction_accepted/)
  assert.match(route, /widget_failed_to_sync_user_external_id/)
  assert.match(migration, /widget_interaction_accepted/)
  assert.equal(migration.includes('parent_phone'), false)
  assert.match(migration, /provider_user_id = zalo_user_id/)
  assert.match(migration, /status = 'ACTIVE'/)
})
