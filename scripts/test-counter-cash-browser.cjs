// Isolated component + actual server action + actual SQL integration harness.
// This verifies the cash panel, not Next authentication or a hosted deployment.
const { createServer }=require('node:http')
const fs=require('node:fs')
const path=require('node:path')
const assert=require('node:assert/strict')
const { randomUUID }=require('node:crypto')
const { chromium }=require('playwright')
const { database }=require('./test-counter-cash-pglite.cjs')
const { harness,renderToStaticMarkup }=require('../tests/helpers/finance-operations.cjs')
const evidence=path.resolve('.backups/counter-cash-browser')
async function main() {
  const db=await database();let browser,server
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0]
  try {
    await db.exec('begin');await db.exec(fs.readFileSync('tests/fixtures/counter-cash.sql','utf8'))
    const app=randomUUID()
    await db.query(`select create_registration_application_with_academics($1,(select id from branches where code='V01'),null,
      'Học viên thử thu tại quầy','2015-03-03','Phụ huynh thử','0909000001',
      'e9500000-0000-4000-8000-000000000020','e9500000-0000-4000-8000-000000000021','e9500000-0000-4000-8000-000000000022',current_date+7,'CN 09:00')`,[app])
    await db.query("select transition_registration_application($1,$2,1,'SUBMIT')",[randomUUID(),app])
    await db.query("select transition_registration_application($1,$2,2,'VERIFY')",[randomUUID(),app])
    await db.query("select set_registration_deposit_quote($1,3,(select id from tuition_plans where code='VIBE_3_MONTHS'),'NONE',0,null,'DEPOSIT_50')",[app])
    const h=harness()
    h.db.rpc=async(name,args)=>{
      assert.equal(name,'record_counter_cash')
      await db.exec('savepoint browser_request')
      try { return {data:await scalar('select record_counter_cash($1,$2,$3,$4,$5,$6,$7,$8)',Object.values(args)),error:null} }
      catch(error){await db.exec('rollback to savepoint browser_request');return {data:null,error:{message:error.message}}}
    }
    const Panel=h.load('counter-cash/CashCollection.tsx').default
    const action=h.load('counter-cash/actions.ts').recordCounterCash
    const css=fs.readdirSync('.next/static',{recursive:true}).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join('.next/static',f),'utf8')).join('\n')
    server=createServer(async(req,res)=>{
      try {
        if(req.method==='POST') {
          let body='';for await(const part of req)body+=part
          const form=new FormData();for(const [key,value]of new URLSearchParams(body))form.set(key,value)
          try {await action(form)}catch(error){if(error.url){res.writeHead(303,{Location:error.url});res.end();return}throw error}
        }
        const params=new URL(req.url,'http://localhost').searchParams
        const summary=await scalar("select counter_cash_summary('REGISTRATION',$1)",[app])
        const today=String(await scalar('select current_date::text'))
        const receipt=summary.receipts.find(r=>r.payment_id===params.get('cash_receipt')&&r.status==='POSTED')
        const html=renderToStaticMarkup(Panel({kind:'REGISTRATION',sourceId:app,total:5500000,paid:Number(summary.paid_amount||0),threshold:2750000,allowed:true,blocked:false,
          requiresDueDate:summary.paid_amount===null,today,receiptId:receipt?.payment_id,error:params.get('cash_error')||undefined,requestId:params.get('cash_request')||undefined}))
          .replace(/<form([^>]*?)action="[^"]*"([^>]*)>/,'<form$1 action="/submit" method="POST"$2>')
          .replace(/<script>[\s\S]*?<\/script>/g,'')
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'})
        res.end(`<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thu tại quầy · Dữ liệu giả</title><style>${css}</style><body class="vibe-admin"><main class="mx-auto grid max-w-4xl gap-5 p-4 sm:p-8"><h1>Đăng ký tại quầy</h1><p>Học viên thử thu tại quầy · Cần Thơ · Gói 3 tháng</p>${html}</main></body></html>`)
      } catch(error){res.writeHead(500);res.end(error.message)}
    })
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    const url=`http://127.0.0.1:${server.address().port}`
    browser=await chromium.launch({headless:true,...(process.env.CASH_BROWSER_EXECUTABLE?{executablePath:process.env.CASH_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox']})
    fs.mkdirSync(evidence,{recursive:true})
    const page=await browser.newPage({viewport:{width:1440,height:1000}})
    await page.goto(url)
    await page.screenshot({path:path.join(evidence,'desktop-before.png'),fullPage:true})
    assert.equal(await page.locator('input[name=amount]').inputValue(),'2750000')
    await page.locator('input[name=due_on]').fill('2026-12-15')
    await page.getByRole('button',{name:'Xác nhận thu tiền mặt'}).click()
    assert.equal(Number(await scalar('select count(*) from counter_cash_receipts where application_id=$1',[app])),0,'Browser requires physical cash acknowledgement')
    await page.locator('input[name=cash_acknowledged]').check()
    await Promise.all([page.waitForURL(/cash_receipt=/),page.getByRole('button',{name:'Xác nhận thu tiền mặt'}).click()])
    await page.getByText('Đã ghi nhận tiền mặt và cập nhật công nợ.',{exact:false}).waitFor()
    assert.equal(Number(await scalar('select count(*) from counter_cash_receipts where application_id=$1',[app])),1)
    await page.setViewportSize({width:390,height:844})
    await page.screenshot({path:path.join(evidence,'mobile-deposit.png'),fullPage:true})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow')
    assert.equal(await page.locator('input[name=due_on]').count(),0,'Top-up uses the same existing bill')
    await page.locator('input[name=cash_acknowledged]').check()
    const previous=page.url()
    await Promise.all([page.waitForURL(value=>value.toString()!==previous),page.getByRole('button',{name:'Xác nhận thu tiền mặt'}).click()])
    await page.getByText('Đã thu đủ học phí.',{exact:true}).waitFor()
    await page.reload()
    assert.equal(await page.locator('form').count(),0)
    await page.screenshot({path:path.join(evidence,'mobile-paid.png'),fullPage:true})
    assert.equal(Number(await scalar('select count(*) from counter_cash_receipts where application_id=$1',[app])),2)
    assert.equal(Number(await scalar('select count(*) from invoices where registration_application_id=$1',[app])),1)
    console.log('PASS: cash panel desktop/mobile, acknowledgement, deposit, top-up, persistent paid state and no overflow')
  } finally {
    await browser?.close();if(server)await new Promise(resolve=>server.close(resolve))
    await db.exec('rollback');await db.close()
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})
