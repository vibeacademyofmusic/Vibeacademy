/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { resolveModule } = require('./helpers/resolve-module.cjs')
const { harness } = require('./helpers/finance-operations.cjs')
const { isBusinessShellPath, navigationForShell } = harness().load('../navigation.ts')

test('business shell accepts only the business route tree', () => {
  assert.equal(isBusinessShellPath('/admin/business'), true)
  assert.equal(isBusinessShellPath('/admin/business/crm/lead'), true)
  for (const pathname of ['/admin', '/admin/finance', '/admin/finance/invoices', '/admin/payroll', '/admin/academic', '/admin/students', '/admin/hr', '/admin/branches', '/admin/instruments', '/admin/business-extra', '', null]) {
    assert.equal(isBusinessShellPath(pathname), false, String(pathname))
  }
})

test('business shell navigation hides unaudited admin domains', () => {
  const hrefs = navigationForShell(true).flatMap(group => group.items.map(item => item.href))
  assert.deepEqual(hrefs, [
    '/admin/business',
    '/admin/business/crm',
    '/admin/business/registrations',
    '/admin/business/campaigns',
    '/admin/business/reports',
    '/admin/business/reactivation',
    '/admin/business/instrument-customers',
  ])
  assert.ok(navigationForShell(false).some(group => group.name === 'TÀI CHÍNH'))
})

function layout({ pathname, superAdmin = false, mayEnter = false, mayStudents = false, signedIn = true }) {
  const mocks = {
    '@/lib/supabase/server': { createClient: async () => ({
      auth: { getClaims: async () => ({ data: signedIn ? { claims: { sub: 'user' } } : null, error: signedIn ? null : { message: 'signed out' } }) },
      rpc: async name => name === 'has_role' ? { data: superAdmin, error: null } : name === 'crm_shell_may_enter' ? { data: mayEnter, error: null } : name === 'student_ops_may_enter' ? { data: mayStudents, error: null } : { data: null, error: null },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { full_name: 'Tester' } }) }) }) }),
    }) },
    'next/headers': { headers: async () => ({ get: key => key === 'x-vibe-pathname' ? pathname : null }) },
    'next/navigation': { redirect: url => { const error = new Error('redirect'); error.url = url; throw error }, usePathname: () => pathname || '/login' },
    'next/link': { default: ({ children, href }) => React.createElement('a', { href }, children) },
    '@/app/login/actions': { logout: async () => {} },
  }
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const compiled = { exports: {} }
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
    const req = name => {
      if (name in mocks) return mocks[name]
      if (name.endsWith('.css')) return { default: {} }
      if (name.startsWith('.') || name.startsWith('@/')) return load(resolveModule(file, name))
      return require(name)
    }
    new Function('require', 'module', 'exports', source)(req, compiled, compiled.exports)
    cache.set(file, compiled.exports)
    return compiled.exports
  }
  return load(path.resolve('app/admin/layout.tsx')).default({ children: React.createElement('p', null, 'Business page') })
}

async function outcome(options) {
  try {
    return { html: renderToStaticMarkup(await layout(options)) }
  } catch (error) {
    return { url: error.url }
  }
}

test('super admin reaches business and the rest of admin', async () => {
  for (const pathname of ['/admin/business', '/admin/finance', '/admin/payroll']) {
    const result = await outcome({ pathname, superAdmin: true })
    assert.match(result.html, /Business page/)
    assert.match(result.html, /\/admin\/finance/)
  }
})

test('branch admin with CRM permission reaches only business routes', async () => {
  const allowed = await outcome({ pathname: '/admin/business/crm', mayEnter: true })
  assert.match(allowed.html, /Business page/)
  assert.match(allowed.html, /Kinh doanh/)
  assert.doesNotMatch(allowed.html, /\/admin\/finance|\/admin\/payroll|\/admin\/academic|\/admin\/students|\/admin\/hr|\/admin\/branches/)
  for (const pathname of ['/admin/finance', '/admin/payroll', '/admin/academic', '/admin/students', '/admin/hr', '/admin']) {
    const denied = await outcome({ pathname, mayEnter: true })
    assert.equal(decodeURIComponent(denied.url), '/login?error=Bạn không có quyền truy cập')
  }
})

test('student operations opens only the exact students list', async () => {
  const allowed = await outcome({ pathname: '/admin/students', mayStudents: true })
  assert.match(allowed.html, /Business page/)
  assert.match(allowed.html, /\/admin\/students/)
  assert.doesNotMatch(allowed.html, /\/admin\/finance|\/admin\/payroll|\/admin\/hr|\/admin\/academic|\/admin\/branches/)
  const detail = await outcome({ pathname: '/admin/students/student-1', mayStudents: true })
  assert.equal(decodeURIComponent(detail.url), '/login?error=Bạn không có quyền truy cập')
  for (const pathname of ['/admin/finance', '/admin/payroll', '/admin/hr', '/admin', '/admin/business']) {
    const denied = await outcome({ pathname, mayStudents: true })
    assert.equal(decodeURIComponent(denied.url), '/login?error=Bạn không có quyền truy cập')
  }
})

test('business and student permissions share a menu without opening other admin domains', async () => {
  const allowed = await outcome({ pathname: '/admin/business', mayEnter: true, mayStudents: true })
  assert.match(allowed.html, /\/admin\/students/)
  assert.match(allowed.html, /\/admin\/business\/crm/)
  assert.doesNotMatch(allowed.html, /\/admin\/finance|\/admin\/payroll|\/admin\/hr/)
})

test('accounts without CRM shell permission are denied, including a missing path header', async () => {
  for (const options of [
    { pathname: '/admin/business', mayEnter: false },
    { pathname: null, mayEnter: true },
    { pathname: '/admin/business', signedIn: false, mayEnter: true },
  ]) {
    const denied = await outcome(options)
    assert.ok(denied.url?.includes('/login'))
  }
})
