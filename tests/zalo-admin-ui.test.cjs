/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { resolveModule } = require('./helpers/resolve-module.cjs')

const root = path.resolve('.')
const files = [
  'app/admin/navigation.ts',
  'app/admin/system/integrations/page.tsx',
  'app/admin/system/integrations/access.ts',
  'app/admin/system/integrations/zalo/page.tsx',
  'app/admin/system/integrations/zalo/view.tsx',
  'app/admin/business/registrations/[id]/page.tsx',
  'app/admin/business/registrations/[id]/ZaloConnection.tsx',
  'lib/integrations/zalo/admin.ts',
  'lib/integrations/zalo/outbound.ts',
]

function load(file, mocks = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file)
  const compiled = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const req = name => {
    if (name in mocks) return mocks[name]
    if (name.endsWith('.css')) return { default: {} }
    if (name.startsWith('.') || name.startsWith('@/')) return load(resolveModule(file, name), mocks, cache)
    return require(name)
  }
  new Function('require', 'module', 'exports', source)(req, compiled, compiled.exports)
  cache.set(file, compiled.exports)
  return compiled.exports
}

const admin = load(path.join(root, 'lib/integrations/zalo/admin.ts'))
const { navigationGroups, systemTabs, workspaceTabsForAccess, navigationForAccess } = load(path.join(root, 'app/admin/navigation.ts'))

test('Zalo lives under Hệ thống → Tích hợp and stays out of other shells', () => {
  const system = navigationGroups.find(group => group.name === 'HỆ THỐNG')
  assert.equal(system.items.find(item => item.name === 'Hệ thống').href, '/admin/branches')
  assert.equal(systemTabs.find(item => item.name === 'Tích hợp').href, '/admin/system/integrations')
  assert.equal(fs.existsSync('app/admin/system/integrations/page.tsx'), true)
  assert.equal(fs.existsSync('app/admin/system/integrations/zalo/page.tsx'), true)
  for (const mode of ['business', 'students', 'business-students']) {
    assert.deepEqual(workspaceTabsForAccess('/admin/system/integrations', mode), [])
    assert.equal(navigationForAccess(mode).some(group => group.items.some(item => item.href.startsWith('/admin/system'))), false)
  }
})

test('config status is boolean and never returns secret values', () => {
  const sentinel = 'zalo-sentinel-secret-value'
  const config = admin.readZaloAdminConfig({
    ZALO_APP_ID: 'public-app',
    ZALO_OA_ID: 'public-oa',
    ZALO_OA_SECRET_KEY: sentinel,
    ZALO_OA_ACCESS_TOKEN: '',
    ZALO_OA_REFRESH_TOKEN: 'refresh-sentinel',
    ZALO_WEBHOOK_PUBLIC_URL: 'https://staging.example/api/integrations/zalo/webhook',
    VERCEL_ENV: 'preview',
  }, 0)
  assert.equal(config.oaSecretConfigured, true)
  assert.equal(config.accessTokenConfigured, false)
  assert.equal(config.refreshTokenConfigured, true)
  assert.equal(config.webhookPublicLabel, 'Đã cấu hình')
  assert.equal(config.webhookRuntimeLabel, 'Đang chờ sự kiện đầu tiên')
  assert.equal(config.environmentLabel, 'Staging')
  assert.equal(JSON.stringify(config).includes(sentinel), false)
  assert.equal(JSON.stringify(config).includes('refresh-sentinel'), false)
  const local = admin.readZaloAdminConfig({}, 2)
  assert.equal(local.environmentLabel, 'Cục bộ')
  assert.equal(local.webhookPublicLabel, 'Chưa triển khai Staging')
  assert.equal(local.webhookRuntimeLabel, 'Chưa cấu hình')
  assert.equal(admin.zaloWebhookRuntimeLabel({ ZALO_APP_ID: 'a', ZALO_OA_ID: 'b', ZALO_OA_SECRET_KEY: 'c' }, 3), 'Đã cấu hình')
})

test('operational text hides token-shaped values', () => {
  const masked = admin.maskOperationalText('failed access_token=fixture-token-value eyJhbGciOiJfake')
  assert.equal(masked.includes('fixture-token-value'), false)
  assert.equal(masked.includes('eyJhbGciOiJfake'), false)
  assert.match(masked, /\[đã ẩn\]/)
})

test('integration page masks config, summarizes events, and refuses other roles', async () => {
  const sentinel = 'page-secret-sentinel-value'
  const previous = {
    secret: process.env.ZALO_OA_SECRET_KEY,
    access: process.env.ZALO_OA_ACCESS_TOKEN,
    refresh: process.env.ZALO_OA_REFRESH_TOKEN,
    app: process.env.ZALO_APP_ID,
    oa: process.env.ZALO_OA_ID,
    url: process.env.ZALO_WEBHOOK_PUBLIC_URL,
    vercel: process.env.VERCEL_ENV,
    runtime: process.env.VIBE_RUNTIME_ENV,
  }
  process.env.ZALO_OA_SECRET_KEY = sentinel
  process.env.ZALO_OA_ACCESS_TOKEN = ''
  process.env.ZALO_OA_REFRESH_TOKEN = ''
  process.env.ZALO_APP_ID = '1355275380325944240'
  process.env.ZALO_OA_ID = '4520912928458797082'
  delete process.env.ZALO_WEBHOOK_PUBLIC_URL
  delete process.env.VERCEL_ENV
  delete process.env.VIBE_RUNTIME_ENV
  const redirects = []
  function database(superAdmin) {
    return {
      rpc: async name => {
        if (name === 'has_role') return { data: superAdmin, error: null }
        if (name === 'zalo_integration_overview') return { data: [{ total_events: 4, events_today: 3, accepted_events: 3, pending_events: 2, failed_events: 1 }], error: null }
        if (name === 'zalo_recent_events') return { data: [{ id: 'event-1', received_at: '2026-09-22T03:00:00.000Z', event_type: 'user_send_text', external_event_id: 'evt-1', status: 'ACCEPTED', processing_state: 'FAILED', processing_error: `access_token=${sentinel}` }], error: null }
        if (name === 'zalo_linked_customers') return { data: [{ link_id: 'link-1', entity_type: 'REGISTRATION', display_label: 'Học viên đăng ký', branch_name: 'Chi nhánh A', linked_at: '2026-09-22T03:00:00.000Z', last_verified_at: null, link_status: 'ACTIVE' }], error: null }
        return { data: null, error: { message: sentinel } }
      },
      from: table => {
        assert.equal(table, 'notification_templates')
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [{
                  template_key: 'ZALO_PAYMENT_RECEIVED',
                  provider: 'ZALO',
                  provider_template_id: null,
                  status: 'PENDING',
                  enabled: false,
                  payload_schema: { student_name: 'string', amount: 'money', payment_date: 'date', payment_number: 'string' },
                }],
                error: null,
              }),
            }),
          }),
        }
      },
    }
  }
  const mocks = superAdmin => ({
    './RegistrationRecovery': { RegistrationRecovery: () => null },
    '@/lib/integrations/zalo/service': { readZaloConnectionView: async () => ({ accessPresent: false, refreshPresent: false }) },
    '@/lib/supabase/server': { createClient: async () => database(superAdmin) },
    'next/navigation': { redirect: url => { redirects.push(url); throw Object.assign(new Error('redirect'), { url }) } },
    'next/link': { default: ({ children, href }) => React.createElement('a', { href }, children) },
  })
  const page = load(path.join(root, 'app/admin/system/integrations/zalo/page.tsx'), mocks(true))
  const html = renderToStaticMarkup(await page.default({searchParams:Promise.resolve({})}))
  assert.match(html, /Cấu hình và nhật ký Zalo/)
  assert.match(html, /4520912928458797082/)
  assert.match(html, /1355275380325944240/)
  assert.match(html, /Đã xác thực/)
  assert.match(html, /Cơ bản/)
  assert.match(html, /ZCA-213532/)
  assert.match(html, /Chưa triển khai Staging/)
  assert.match(html, /Đã cấu hình/)
  assert.match(html, /Chưa cấu hình/)
  assert.match(html, /POST \/api\/integrations\/zalo\/webhook/)
  assert.match(html, /Cục bộ/)
  assert.match(html, />4</)
  assert.match(html, /Tin nhắn văn bản/)
  assert.match(html, /Đã tiếp nhận/)
  assert.match(html, /Lỗi xử lý/)
  assert.match(html, /Webhook Zalo/)
  assert.match(html, /Hồ sơ đăng ký/)
  assert.match(html, /Đã kết nối/)
  assert.match(html, /Chưa kích hoạt/)
  assert.match(html, /Chưa mở đầy đủ OpenAPI gửi tin/)
  assert.match(html, /ZALO_PAYMENT_RECEIVED/)
  assert.match(html, /PENDING/)
  assert.match(html, /Schema có, gửi đang tắt|Thiếu schema|Sẵn sàng gửi/)
  assert.equal(html.includes(sentinel), false)
  assert.equal(html.includes('ACCEPTED'), false)
  assert.equal(html.includes('provider_user_id'), false)
  assert.equal(html.includes('user_send_text'), false)
  const denied = load(path.join(root, 'app/admin/system/integrations/zalo/page.tsx'), mocks(false))
  await assert.rejects(() => denied.default({searchParams:Promise.resolve({})}), error => error.url?.includes('/login'))
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[{
      secret: 'ZALO_OA_SECRET_KEY',
      access: 'ZALO_OA_ACCESS_TOKEN',
      refresh: 'ZALO_OA_REFRESH_TOKEN',
      app: 'ZALO_APP_ID',
      oa: 'ZALO_OA_ID',
      url: 'ZALO_WEBHOOK_PUBLIC_URL',
      vercel: 'VERCEL_ENV',
      runtime: 'VIBE_RUNTIME_ENV',
    }[key]]
    else process.env[{
      secret: 'ZALO_OA_SECRET_KEY',
      access: 'ZALO_OA_ACCESS_TOKEN',
      refresh: 'ZALO_OA_REFRESH_TOKEN',
      app: 'ZALO_APP_ID',
      oa: 'ZALO_OA_ID',
      url: 'ZALO_WEBHOOK_PUBLIC_URL',
      vercel: 'VERCEL_ENV',
      runtime: 'VIBE_RUNTIME_ENV',
    }[key]] = value
  }
})

test('registration card shows current persisted link state and never activates from UI alone', () => {
  const card = load(path.join(root, 'app/admin/business/registrations/[id]/ZaloConnection.tsx'), {
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    '../actions': { refreshRegistrationZaloLink() {}, requestRegistrationZaloLink() {} },
    'next/script': { default: () => null },
  })
  const render = status => renderToStaticMarkup(React.createElement(card.ZaloConnectionCard, {
    applicationId: 'synthetic', connection: { link_status: status, external_link_key: null, linked_at: null, last_verified_at: null, masked_user_id: null },
  }))
  assert.match(render('NONE'), /CHƯA KẾT NỐI/)
  assert.match(render('PENDING'), /ĐANG CHỜ XÁC NHẬN/)
  assert.match(render('ACTIVE'), /ĐÃ KẾT NỐI/)
  assert.doesNotMatch(render('ACTIVE'), /<button/)
  assert.match(render('REVIEW'), /CẦN KIỂM TRA/)
  assert.doesNotMatch(render('PENDING'), /ĐÃ KẾT NỐI/)
})

test('registration page reads scoped phone consent and new files do not embed secrets', () => {
  const page = fs.readFileSync('app/admin/business/registrations/[id]/page.tsx', 'utf8')
  assert.match(page, /registration_zalo_consent_details/)
  assert.match(page, /ConsentPanel/)
  assert.equal(page.includes('provider_user_id'), false)
  const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n')
  assert.equal(/eyJ[A-Za-z0-9_-]{8,}/.test(source), false)
  assert.equal(source.includes('ZALO_OA_SECRET_KEY='), false)
  assert.equal(source.includes('provider_user_id'), false)
  const students = fs.readFileSync('app/admin/students/[id]/page.tsx', 'utf8')
  assert.equal(students.includes('KẾT NỐI ZALO'), false)
})
