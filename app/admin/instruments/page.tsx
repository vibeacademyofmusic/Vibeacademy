import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { adminClient, pageNumber, uuidPattern } from '../finance/operations'
import { instrumentAction } from './actions'
const field = 'w-full rounded border p-2'
export default async function InstrumentsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const p=await searchParams,db=await adminClient(),page=pageNumber(p.page),unitPage=pageNumber(p.units),historyPage=pageNumber(p.history)
  const model=p.model && uuidPattern.test(p.model)?p.model:undefined,unit=p.unit && uuidPattern.test(p.unit)?p.unit:undefined
  const [models,branches,units,detail,commercial,events]=await Promise.all([
    db.from('instrument_catalogue').select('item_id,brand,model').order('item_id').range((page-1)*25,page*25),
    db.from('branches').select('id,name').eq('status','ACTIVE').order('name').limit(500),
    model?db.from('instrument_units').select('id,serial,created_at').eq('item_id',model).order('serial').range((unitPage-1)*25,unitPage*25):Promise.resolve({data:[],error:null}),
    unit?db.from('instrument_units').select('id,item_id,serial').eq('id',unit).maybeSingle():Promise.resolve({data:null,error:null}),
    unit?db.from('instrument_commercial_details').select('supplier,acquisition_cost,asking_price,currency').eq('unit_id',unit).maybeSingle():Promise.resolve({data:null,error:null}),
    unit?db.from('instrument_events').select('movement_id,kind,branch_id,destination_id,sale_price,currency,warranty_until,reason,created_at').eq('unit_id',unit).order('created_at',{ascending:false}).order('movement_id',{ascending:false}).range((historyPage-1)*25,historyPage*25):Promise.resolve({data:[],error:null}),
  ])
  const latest=unit?await db.from('instrument_events').select('kind,branch_id,destination_id').eq('unit_id',unit).order('created_at',{ascending:false}).order('movement_id',{ascending:false}).limit(1):{data:[],error:null}
  const inStock=latest.data?.[0] && latest.data[0].kind!=='SALE'
  const branchName=(id:string)=>branches.data?.find(b=>b.id===id)?.name||id
  const link=(values:Record<string,string>)=>'/admin/instruments?'+new URLSearchParams({page:String(page),model:model||'',unit:unit||'',...values})
  const failed=[models,branches,units,detail,commercial,events,latest].some(r=>r.error)
  return <div className="space-y-6 p-4 sm:p-6">
    <h1 className="text-2xl font-semibold">Nhạc cụ theo serial</h1>
    <p>Giá vốn chỉ dành cho quản trị viên. Ghi nhận bán ở đây là chứng từ xuất kho, không xác nhận đã thu tiền hoặc tự tạo doanh thu.</p>
    {p.success&&<p role="status" className="text-green-700">Đã ghi nhận.</p>}
    {(p.error||failed)&&<p role="alert" className="text-red-700">{p.error==='invalid'?'Vui lòng kiểm tra dữ liệu nhập.':'Không thể hoàn tất. Kiểm tra serial trùng, tình trạng tồn và quyền truy cập.'}</p>}
    <section><h2 className="font-semibold">Danh mục model</h2><ul>{models.data?.slice(0,25).map(m=><li key={m.item_id}><Link prefetch={false} className="text-blue-700 underline" href={link({model:m.item_id,unit:'',units:'1'})}>{m.brand} — {m.model}</Link></li>)}</ul>
      {!models.data?.length&&!models.error&&<p>Chưa có model.</p>}
      <nav className="flex gap-4">{page>1&&<Link prefetch={false} href={link({page:String(page-1)})}>Model trước</Link>}{(models.data?.length||0)>25&&<Link prefetch={false} href={link({page:String(page+1)})}>Model sau</Link>}</nav>
    </section>
    <details className="rounded border p-4"><summary>Thêm model nhạc cụ</summary><form action={instrumentAction} className="mt-3 grid gap-3 sm:grid-cols-2"><input type="hidden" name="action" value="MODEL" />
      {([['code','Mã model',50],['name','Tên mặt hàng',200],['category','Loại nhạc cụ',100],['brand','Thương hiệu',100],['model_name','Model',100]] as const).map(([name,label,max])=><label key={name}>{label}<input className={field} name={name} maxLength={max} required /></label>)}<button className="rounded bg-blue-700 p-2 text-white">Tạo model</button>
    </form></details>
    {model&&<section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Serial của model</h2><ul>{units.data?.slice(0,25).map(u=><li key={u.id}><Link prefetch={false} className="text-blue-700 underline" href={link({unit:u.id,history:'1'})}>{u.serial}</Link></li>)}</ul>
      <nav className="flex gap-4">{unitPage>1&&<Link prefetch={false} href={link({units:String(unitPage-1)})}>Serial trước</Link>}{(units.data?.length||0)>25&&<Link prefetch={false} href={link({units:String(unitPage+1)})}>Serial sau</Link>}</nav>
      <details><summary>Nhập một nhạc cụ</summary><form key={model} action={instrumentAction} className="mt-3 grid gap-3 sm:grid-cols-2"><input type="hidden" name="action" value="RECEIVE" /><input type="hidden" name="model" value={model} /><input type="hidden" name="request" value={randomUUID()} />
        <label>Serial<input className={field} name="serial" maxLength={150} required /></label><label>Nhà cung cấp<input className={field} name="supplier" maxLength={200} required /></label>
        <label>Kho nhập<select className={field} name="branch" required>{branches.data?.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Giá vốn<input className={field} name="cost" type="number" min="0" step="0.01" required /></label><label>Giá bán dự kiến<input className={field} name="price" type="number" min="0" step="0.01" required /></label>
        <label>Tiền tệ<input className={field} name="currency" defaultValue="VND" pattern="[A-Z]{3}" required /></label><label>Lý do nhập<input className={field} name="reason" maxLength={2000} required /></label><button className="rounded bg-blue-700 p-2 text-white">Nhập serial</button>
      </form></details>
    </section>}
    {detail.data&&<section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Serial: {detail.data.serial}</h2>
      {commercial.data&&<p>Nhà cung cấp: {commercial.data.supplier}. Giá vốn: {Number(commercial.data.acquisition_cost).toLocaleString('vi-VN')} {commercial.data.currency}. Giá dự kiến: {Number(commercial.data.asking_price).toLocaleString('vi-VN')} {commercial.data.currency}.</p>}
      {latest.data?.[0]&&<p>{inStock?'Đang ở kho: '+branchName(latest.data[0].destination_id||latest.data[0].branch_id):'Đã xuất bán — không còn trong kho'}</p>}
      {inStock&&!failed&&<form key={unit} action={instrumentAction} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="request" value={randomUUID()} /><input type="hidden" name="unit" value={unit} /><input type="hidden" name="model" value={detail.data.item_id} />
        <label>Thao tác<select className={field} name="action"><option value="TRANSFER">Chuyển kho</option><option value="SALE">Ghi nhận xuất bán</option></select></label>
        <label>Kho đến khi chuyển<select className={field} name="destination"><option value="">Chọn kho</option>{branches.data?.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Giá bán thực tế<input className={field} name="price" type="number" min="0" step="0.01" /></label><label>Tiền tệ khi bán<input className={field} name="currency" defaultValue="VND" pattern="[A-Z]{3}" /></label>
        <label>Bảo hành đến (nếu có)<input className={field} name="warranty" type="date" /></label><label>Lý do / tham chiếu chứng từ<input className={field} name="reason" maxLength={2000} required /></label>
        <button className="rounded bg-blue-700 p-2 text-white">Ghi nhận nhạc cụ</button>
      </form>}
      <h3 className="font-semibold">Lịch sử serial</h3><ul className="space-y-2">{events.data?.slice(0,25).map(e=><li className="break-words border-t pt-2" key={e.movement_id}>{e.kind==='SALE'?'Xuất bán':e.kind==='TRANSFER'?'Chuyển kho':'Nhập kho'} · {branchName(e.branch_id)}{e.destination_id?' → '+branchName(e.destination_id):''}{e.sale_price!==null?' · '+Number(e.sale_price).toLocaleString('vi-VN')+' '+e.currency:''}<p>{e.reason}</p>{e.warranty_until&&<p>Bảo hành đến: {e.warranty_until}</p>}<p>{new Date(e.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</p></li>)}</ul>
      <nav className="flex gap-4">{historyPage>1&&<Link prefetch={false} href={link({history:String(historyPage-1)})}>Lịch sử trước</Link>}{(events.data?.length||0)>25&&<Link prefetch={false} href={link({history:String(historyPage+1)})}>Lịch sử sau</Link>}</nav>
    </section>}
  </div>
}
