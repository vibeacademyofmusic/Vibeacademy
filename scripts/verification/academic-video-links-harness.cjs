// Component + Server Action + SQL verification, with synthetic identity helpers.
// This is not the Next/Supabase application and must never be deployed.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const ts = require('typescript')
const { createRequire } = require('node:module')
const { createFixture, ids } = require('../../tests/helpers/video-link-db-fixture.cjs')
const tools = createRequire(path.join(process.env.VIBE_VIDEO_TEST_TOOLS, 'package.json'))
const { build } = tools('esbuild')

async function main() {
  const db = await createFixture()
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-video-browser-'))
  const file = path.join(directory, 'client.js')
  await db.save({ shared: true })

  const adapter = {
    auth: { getClaims: async () => ({ data: { claims: { sub: ids.admin } } }) },
    rpc: async (name, args) => {
      try {
        if (!['save_academic_video_link', 'remove_academic_video_link'].includes(name)) throw new Error('Unexpected function')
        const values = Object.values(args)
        const params = values.map((_, i) => `$${i + 1}`).join(',')
        // The server actions use named parameters; preserve the declared SQL order.
        const keys = name === 'save_academic_video_link'
          ? ['p_student','p_enrollment','p_id','p_version','p_title','p_url','p_note','p_level','p_item','p_shared']
          : ['p_student','p_enrollment','p_id','p_version']
        const data = await db.db.query(`select ${name}(${params}) as result`, keys.map(k => args[k]))
        return { data: data.rows[0].result, error: null }
      } catch (error) { return { data: null, error: { code: error.code, message: error.message } } }
    },
  }
  function load(file) {
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const mod = { exports: {} }
    const req = name => {
      if (name === '@/lib/supabase/server') return { createClient: async () => adapter }
      if (name === 'next/cache') return { revalidatePath: () => {} }
      if (name.startsWith('@/')) return load(path.resolve(name.slice(2) + '.ts'))
      return require(name)
    }
    new Function('require', 'module', 'exports', source)(req, mod, mod.exports)
    return mod.exports
  }
  const actions = load(path.resolve('app/_components/academic-video-links/actions.ts'))
  const source = `
    import React, {useState, useEffect} from 'react';
    import {createRoot} from 'react-dom/client';
    import VideoLinks from './app/_components/academic-video-links/VideoLinks';
    function App() {
      const [context,setContext]=useState(null);
      useEffect(()=>{const update=()=>fetch('/context'+location.search).then(r=>r.json()).then(setContext); update(); window.addEventListener('video-saved',update); return()=>window.removeEventListener('video-saved',update)},[]);
      return <main className="vibe-admin mx-auto min-h-screen max-w-5xl space-y-6 p-4 sm:p-8">
        <header><p className="vibe-eyebrow">VIBE ACADEMY · DỮ LIỆU GIẢ LẬP</p><h1>Hành trình học tập</h1><p>Học viên thử nghiệm · Piano Pre Step</p></header>
        {context && <VideoLinks studentId="${ids.learner}" enrollmentId="${ids.program}" context={context}/>}
      </main>
    }
    createRoot(document.getElementById('root')).render(<App/>);
  `
  await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, outfile: file, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{
    name: 'test-action-boundary', setup(b) {
      b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture-link' }))
      b.onLoad({ filter: /.*/, namespace: 'fixture-link' }, () => ({ contents: `import React from 'react'; export default function Link({href,children}){return <a href={href}>{children}</a>}`, loader: 'jsx', resolveDir: process.cwd() }))
      b.onResolve({ filter: /^\.\/actions$/ }, args => args.importer.endsWith('VideoLinks.tsx') ? { path: 'actions', namespace: 'fixture' } : undefined)
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        async function call(name,state,form){const r=await fetch('/action/'+name,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(form))});const result=await r.json();if(result.ok)window.dispatchEvent(new Event('video-saved'));return result}
        export const saveVideoLink=(s,f)=>call('saveVideoLink',s,f);export const removeVideoLink=(s,f)=>call('removeVideoLink',s,f);
      `, loader: 'js' }))
    },
  }] })
  const postcss = require('postcss'), tailwind = require('@tailwindcss/postcss')
  const css = await postcss([tailwind({ base: process.cwd() })]).process(fs.readFileSync('app/globals.css','utf8'), { from: path.resolve('app/globals.css') })
  fs.writeFileSync(path.join(directory,'global.css'),css.css)
  const html = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VIBE Video Links — Synthetic Verification</title><link rel="stylesheet" href="/global.css"><link rel="stylesheet" href="/client.css"></head><body><div id="root"></div><script src="/client.js"></script></body></html>'
  // Serialize requests because this disposable database has a single connection.
  let queue = Promise.resolve()
  const server = http.createServer((req,res) => {
    queue = queue.then(async () => {
      const url = new URL(req.url, 'http://127.0.0.1:3000')
      if (req.method === 'GET' && url.pathname === '/') { res.setHeader('content-type','text/html; charset=utf-8'); res.end(html); return }
      if (req.method === 'GET' && ['/client.js','/client.css','/global.css'].includes(url.pathname)) { res.setHeader('content-type',url.pathname.endsWith('.js')?'text/javascript':'text/css'); res.end(fs.readFileSync(path.join(directory,url.pathname.slice(1)))); return }
      res.setHeader('content-type','application/json; charset=utf-8')
      if (req.method === 'GET' && url.pathname === '/context') {
        await db.identity(url.searchParams.get('role') === 'parent' ? ids.parent : ids.admin)
        res.end(JSON.stringify(await db.context())); return
      }
      if (req.method === 'POST' && ['/action/saveVideoLink','/action/removeVideoLink'].includes(url.pathname)) {
        // Synthetic writer only. Real application auth is separately tested.
        await db.identity(ids.admin)
        const chunks=[]; let length=0
        for await (const chunk of req) { length+=chunk.length; if(length>16000)throw new Error('Request too large'); chunks.push(chunk) }
        const input=JSON.parse(Buffer.concat(chunks).toString()), form=new FormData()
        for(const [key,value] of Object.entries(input))form.set(key,value)
        res.end(JSON.stringify(await actions[url.pathname.split('/').pop()]({ok:false,message:''},form))); return
      }
      res.statusCode=404;res.end('{}')
    }).catch(error => { res.statusCode=500;res.end(JSON.stringify({error:error.message})) })
  })
  server.listen(3000,'127.0.0.1',()=>console.log('SYNTHETIC HARNESS ONLY http://127.0.0.1:3000'))
  process.on('SIGTERM',()=>server.close(async()=>{await db.db.close();fs.rmSync(directory,{recursive:true,force:true});process.exit(0)}))
}
main().catch(error=>{console.error(error);process.exitCode=1})
