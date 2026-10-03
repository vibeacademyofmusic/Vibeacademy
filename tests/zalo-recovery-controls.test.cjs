const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const labels=require('./helpers/zalo-module-loader.cjs')()('lib/integrations/zalo/recovery-labels.ts')
const m={exports:{}}
new Function('module','exports','require',ts.transpileModule(fs.readFileSync('app/admin/system/integrations/zalo/RecoveryControls.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(m,m.exports,id=>id==='react'?{...React,useActionState:(_action,view)=>[view,()=>{},false]}:id==='next/link'?{default:({children,...props})=>React.createElement('a',props,children)}:id.includes('recovery-labels')?labels:id==='./recovery-actions'?{recoverNotificationAction:()=>{}}:require(id))
for(const [state,label] of [['SEND','Gửi thông báo'],['RETRY','Gửi lại thông báo'],['BLOCKED','Kiểm tra lại điều kiện'],['ACCEPTED','Kiểm tra trạng thái'],['UNCERTAIN','Kiểm tra trạng thái'],['DELIVERED','Đã có xác nhận phát tin.']]) test('rendered recovery controls: '+state,()=>{
 const html=renderToStaticMarkup(React.createElement(m.exports.RecoveryControls,{initial:{state,reason:state==='BLOCKED'?'GATE_DISABLED':'CHANNEL_READY',jobId:'synthetic',attempts:0}}))
 assert.ok(html.includes(label))
 if(['ACCEPTED','UNCERTAIN','DELIVERED'].includes(state))assert.doesNotMatch(html,/value="SEND"/)
 if(state==='BLOCKED')assert.match(html,/value="SEND" disabled=""/)
 if(['SEND','RETRY'].includes(state))assert.doesNotMatch(html,/disabled=""/)
})
