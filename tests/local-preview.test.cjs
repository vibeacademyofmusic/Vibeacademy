const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {execFileSync}=require('node:child_process')
const {fingerprint,assertFresh}=require('../scripts/local-preview.cjs')
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-preview-test-'))
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}))
 execFileSync('git',['init','-q'],{cwd:root})
 fs.mkdirSync(path.join(root,'app'));fs.writeFileSync(path.join(root,'app/page.tsx'),'original')
 fs.mkdirSync(path.join(root,'.next/cache'),{recursive:true})
 fs.writeFileSync(path.join(root,'.next/BUILD_ID'),'build-1')
 return root
}
function record(root){fs.writeFileSync(path.join(root,'.next/cache/vibe-preview.json'),JSON.stringify({fingerprint:fingerprint(root),buildId:'build-1'}))}
test('preview refuses unverified builds and accepts a matching completed build',t=>{const root=fixture(t);assert.throws(()=>assertFresh(root),/No verified/);record(root);assert.equal(assertFresh(root).buildId,'build-1')})
test('preview rejects edited, added, deleted source and environment changes',t=>{for(const mutation of ['edit','add','delete','env']){const root=fixture(t);record(root);if(mutation==='edit')fs.writeFileSync(path.join(root,'app/page.tsx'),'changed');if(mutation==='add')fs.writeFileSync(path.join(root,'app/extra.ts'),'new');if(mutation==='delete')fs.unlinkSync(path.join(root,'app/page.tsx'));if(mutation==='env')fs.writeFileSync(path.join(root,'.env.local'),'PRIVATE=fixture');assert.throws(()=>assertFresh(root),/stale/)}})
test('preview rejects a replaced build artifact',t=>{const root=fixture(t);record(root);fs.writeFileSync(path.join(root,'.next/BUILD_ID'),'other-build');assert.throws(()=>assertFresh(root),/stale/)})

test('preview refuses active or incomplete builds even when an old valid build exists',t=>{for(const file of ['.next/lock','.next/cache/vibe-preview-pending.json']){const root=fixture(t);record(root);fs.writeFileSync(path.join(root,file),'{}');assert.throws(()=>assertFresh(root),/active or incomplete/)}})
