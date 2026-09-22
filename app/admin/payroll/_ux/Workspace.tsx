'use client'
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Modal } from './Dialog'
import { filterRows, summarize, formatMoney, statusLabels, typeLabels, timeText, dateText, cents, type Workspace as WorkspaceData, type RowView, type MoneyFields } from './model'
import styles from './payroll.module.css'

type Tab = 'staff' | 'sources' | 'issues' | 'history'
const tabs: { id: Tab; text: string }[] = [{ id: 'staff', text: 'Bảng nhân viên' }, { id: 'sources', text: 'Dữ liệu đầu vào' }, { id: 'issues', text: 'Vấn đề cần xử lý' }, { id: 'history', text: 'Lịch sử' }]
function Tone({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={styles.tag} data-tone={tone}>{children}</span> }
function Kpis({ summary, multiple, empty, currency }: { summary: MoneyFields; multiple: boolean; empty: boolean; currency: string }) {
  const entries: { title: string; key: keyof MoneyFields; note: string; highlight?: boolean }[] = [
    { title: 'Thu nhập đã tính', key: 'earnings', note: 'Lương + các khoản cộng đã lưu' },
    { title: 'Khấu trừ đã tính', key: 'deductions', note: 'Các khoản trừ trong bản đã tính' },
    { title: 'Hoàn trả trong kỳ', key: 'reimbursements', note: 'Khoản đã đưa vào Payroll' },
    { title: 'Tổng phải trả · bản đang xem', key: 'net', note: 'Không đồng nghĩa đã chuyển tiền', highlight: true },
  ]
  return <div className={styles.kpis}>{entries.map(entry => <section className={`${styles.kpi} ${entry.highlight ? styles.highlight : ''}`} key={entry.key}><p className={styles.small + ' ' + styles.muted}>{entry.title}</p><div className={styles.value}>{multiple ? 'Nhiều tiền tệ' : empty ? '—' : formatMoney(summary[entry.key])}</div><p className={styles.caption}>{multiple ? 'Chọn một tiền tệ để xem tổng' : empty ? 'Chưa có bản tính trong bộ lọc' : `${currency} · ${entry.note}`}</p></section>)}</div>
}
function Detail({ row, periodId, finance, closed, finalized }: { row: RowView; periodId: string; finance: boolean; closed: boolean; finalized: boolean }) {
  const oldInsurance = row.sources.some(s => ['SOCIAL_INSURANCE', 'LABOR_INSURANCE'].includes(s.code)) || row.lines.some(s => ['SOCIAL_INSURANCE', 'LABOR_INSURANCE'].includes(s.code))
  return <div>

    <div className={styles.sourcebox}>Kết quả đã tính và cấu hình hiện tại là hai nguồn riêng. Thay cấu hình không tự sửa số tiền của kỳ này. Chưa xác nhận việc chi trả.</div>
    {row.findings.filter(f => f.severity !== 'info').map((f, i) => <p key={f.code + i} className={`${styles.note} ${f.severity === 'error' ? styles.stopText : styles.warningText}`}>• {f.message}</p>)}
    <div className={styles.comparison}><section><h2>Kết quả đã tính</h2>
      <div className={`${styles.detailGrid} ${styles.spaced}`}>{[{ label: 'Thu nhập đã tính', value: row.earnings }, { label: 'Khấu trừ đã tính', value: row.deductions }, { label: 'Hoàn trả', value: row.reimbursements }, { label: 'Tổng phải trả', value: row.net }].map(item => <div key={item.label}><p className={styles.tiny}>{item.label}</p><div className={styles.detailValue}>{formatMoney(item.value, row.currency)}</div></div>)}</div>
      <h3 className={styles.spaced}>Chi tiết nguồn đã tính</h3>
      {!row.sourceAvailable ? <p className={styles.note}>Không đọc đủ chi tiết nguồn. Các tổng ở trên là giá trị đã lưu, không phải tổng suy đoán.</p> : <div className={`${styles.scroll} ${styles.spaced}`}><table className={styles.table}><thead><tr><th>Ngày / nguồn</th><th>Thành phần</th><th className={styles.num}>Số lượng</th><th className={styles.num}>Đơn giá</th><th className={styles.num}>Thành tiền</th></tr></thead><tbody>{row.lines.length ? row.lines.map(line => <tr key={line.id}><td>{!finance && line.sessionId ? <Link prefetch={false} href={'/admin/attendance/' + line.sessionId}>{line.date}</Link> : line.date}<div className={styles.tiny}>{line.source}</div></td><td>{line.label}<div className={styles.tiny}>{line.category}</div></td><td className={styles.num}>{line.quantity}</td><td className={styles.num}>{line.rate}</td><td className={styles.num}>{line.amount}</td></tr>) : <tr><td className={styles.empty} colSpan={5}>Chưa có dòng thành phần trong bản tính.</td></tr>}</tbody></table></div>}
      <h3 className={styles.spaced}>Thưởng & khoản phát sinh</h3>
      {!row.sourceAvailable ? <p className={styles.note}>Chưa đọc được khoản phát sinh.</p> : row.actions.length ? row.actions.map(a => <section key={a.id} className={styles.section}><div className={styles.row}><strong className={styles.fill}>{a.label}</strong><strong>{a.amount}</strong></div><p className={styles.note}>{a.reason}</p><div className={styles.statusbar}><Tone>{a.state}</Tone><Tone>{a.approved}</Tone></div><p className={styles.technical}>{a.source}</p></section>) : <p className={styles.note}>Không có khoản phát sinh trong nguồn đã đọc.</p>}
      {cents(row.adjustment) !== null && cents(row.adjustment) !== BigInt(0) && <div className={styles.sourcebox}>Điều chỉnh theo cơ chế cũ: <strong>{formatMoney(row.adjustment, row.currency)}</strong>. Khoản này đã nằm trong tổng phải trả; không cộng lại.</div>}
    </section><section><h2>Cấu hình hiện tại / nguồn mới</h2>
      <h3 className={styles.spaced}>Cấu hình giao với kỳ đang xem</h3>
      <p className={styles.note}>“Chưa có dòng tính” không đồng nghĩa số tiền bằng 0 hoặc cấu hình đã được áp dụng.</p>
      <div className={`${styles.scroll} ${styles.spaced}`}><table className={styles.table}><thead><tr><th>Thành phần / hiệu lực</th><th>Cấu hình hiện tại</th><th>Trong bản đã tính</th></tr></thead><tbody>{row.sources.length ? row.sources.map(s => <tr key={s.id}><td><strong>{s.label}</strong><div className={styles.tiny}>{s.range}</div><div className={styles.tiny}>{s.state}</div></td><td>{s.configured}</td><td>{s.calculated}</td></tr>) : <tr><td className={styles.empty} colSpan={3}>{row.sourceAvailable ? 'Không có cấu hình V2 trong phạm vi đã đọc.' : 'Không tải đủ cấu hình.'}</td></tr>}</tbody></table></div>
      {oldInsurance && <p className={styles.note}>BHXH+BHLĐ ở bảng tổng hợp là cách nhóm các dòng để xem. Nguồn cũ vẫn hiện riêng ở đây; đợt giao diện này không chuyển mã, sửa ngày hoặc tạo thêm khoản bảo hiểm.</p>}
    </section></div>
    <div className={styles.linkList}>
      {closed && (
        <Link
          prefetch={false}
          className={styles.btn}
          href={'/documents/payslips/' + row.id}
        >
          Xem / In phiếu lương
        </Link>
      )}

      {!finance && finalized && (
        <Link
          prefetch={false}
          className={`${styles.btn} ${styles.primary}`}
          href={'/admin/hr/payslips?payroll=' + row.id + '#record-payment'}
        >
          Ghi nhận chi trả
        </Link>
      )}{!finance && row.employeeId && <Link prefetch={false} className={styles.btn} href={'/admin/employees/' + row.employeeId + '/compensation'}>Mở cấu hình nhân viên</Link>}{!finance && row.recipientId && <Link prefetch={false} className={styles.btn} href={'/admin/payroll/' + periodId + '/' + row.recipientId}>Mở chi tiết & thao tác</Link>}</div>
    <details className={`${styles.details} ${styles.spaced}`}><summary>Thông tin truy vết</summary><p className={styles.technical}>Mã bảng lương: {row.id}</p><p className={styles.technical}>Phiên bản tính: {row.engine}</p><p className={styles.note}>Chỉ đối chiếu cấu hình và dòng đã tính; chưa kiểm tra lại đầy đủ nguồn buổi dạy trong đợt 1.</p></details>
  </div>
}

export default function Workspace({ data, workflow, finance = false, initialQuery = '', initialTeacher = '', initialType = '', initialCurrency = '', initialTab = 'staff', initialSelected = '', initialPage = 1 }: { data: WorkspaceData; workflow: ReactNode; finance?: boolean; initialQuery?: string; initialTeacher?: string; initialType?: string; initialCurrency?: string; initialTab?: string; initialSelected?: string; initialPage?: number }) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [teacher, setTeacher] = useState(initialTeacher)
  const [type, setType] = useState(initialType)
  const [currency, setCurrency] = useState(data.currencyOptions.includes(initialCurrency) ? initialCurrency : data.currencyOptions.length === 1 ? data.currencyOptions[0] : '')
  const [tab, setTab] = useState<Tab>(tabs.some(t => t.id === initialTab) ? initialTab as Tab : 'staff')
  const [selected, setSelected] = useState(initialSelected)
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [requestedPage, setPage] = useState(initialPage)
  const visible = useMemo(() => filterRows(data.rows, query, type, currency).filter(r => !teacher || r.teacherId === teacher || r.employeeId === teacher), [data.rows, query, type, currency, teacher])
  const pages = Math.max(1, Math.ceil(visible.length / 25)), page = Math.min(Math.max(1, requestedPage), pages)
  const sliced = visible.slice((page - 1) * 25, page * 25)
  const currencies = [...new Set(visible.map(r => r.currency))]
  const multiple = currencies.length > 1
  const summary = summarize(multiple ? [] : visible)
  const showOtherDeduction = visible.some(r => r.otherDeductions !== null && cents(r.otherDeductions) !== BigInt(0))
  const showAdjustment = visible.some(r => r.adjustment === null || cents(r.adjustment) !== BigInt(0))
  const issueRows = data.rows.filter(r => r.tone !== 'neutral')
  const countIssues = issueRows.length + data.missingPay.length
  const detail = data.rows.find(r => r.id === selected)
  const currencyCaption = currency || currencies[0] || 'VND'
  const closed = ['APPROVED', 'FINALIZED'].includes(data.head.status)
  const month = data.head.starts_on.slice(0, 7).split('-').reverse().join('/')
  const back = finance ? '/finance' : '/admin/payroll'
  useEffect(() => {
    const url = new URL(window.location.href)
    for (const [key, value] of Object.entries({ q: query, teacher, type, currency, tab: tab === 'staff' ? '' : tab, payroll: selected, page: page > 1 ? String(page) : '' })) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key) }
    window.history.replaceState(window.history.state, '', url)
  }, [query, teacher, type, currency, tab, selected, page])
  const keyboardTab = (e: KeyboardEvent<HTMLButtonElement>, at: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    setTab(tabs[next].id)
    ;(e.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus()
  }
  return <div className={styles.root}>
    <nav className={styles.moduleNav} aria-label="Công và lương"><Link prefetch={false} href={back}>← {finance ? 'Phê duyệt tài chính' : 'Các kỳ lương'}</Link>{!finance && <><Link prefetch={false} href="/admin/employees">Cấu hình nhân viên</Link><Link prefetch={false} href="/admin/employees/attendance">Chấm công nhân viên</Link></>}</nav>
    <header className={styles.heading}><div><div className={styles.eyebrow}>01 / Kỳ lương</div><h1>Kỳ lương tháng {month}</h1><p className={styles.sub}>{data.branchName} · {dateText(data.head.starts_on)}–{dateText(data.head.ends_on)} · Phiên bản {data.head.version}</p><div className={styles.statusbar}><Tone tone={closed ? 'green' : 'blue'}>{statusLabels[data.head.status] || data.head.status}</Tone>{countIssues > 0 && <Tone tone="warning">Cần đối chiếu nguồn</Tone>}<Tone>Chi trả: chưa đối soát ở màn này</Tone></div></div><div className={styles.actions}>
      {data.head.status === 'FINALIZED' && (
        <Link
          prefetch={false}
          className={`${styles.btn} ${styles.primary}`}
          href={'/admin/hr/payslips?period=' + data.head.id}
        >
          Phiếu lương & chi trả
        </Link>
      )}
      <button
        type="button"
        className={styles.btn}
        onClick={() => setRulesOpen(true)}
      >
        Quy tắc thao tác
      </button>
      {data.head.status !== 'FINALIZED' && (
        <button
          type="button"
          className={`${styles.btn} ${styles.primary}`}
          onClick={() => setWorkflowOpen(true)}
        >
          Xem chênh lệch & tính lại
        </button>
      )}
    </div></header>
    <section className={`${styles.card} ${styles.filters}`} aria-label="Bộ lọc trong kỳ"><label className={styles.field}>Kỳ đang xem<input readOnly value={month}/></label><label className={styles.field}>Chi nhánh<input readOnly value={data.branchName}/></label><label className={`${styles.field} ${styles.grow}`}>Tìm nhân viên<input type="search" placeholder="Tên hoặc mã nhân viên" maxLength={100} value={query} onChange={e => { setQuery(e.target.value); setPage(1) }}/></label><label className={styles.field}>Hình thức<select value={type} onChange={e => { setType(e.target.value); setPage(1) }}><option value="">Tất cả</option>{[...new Set(data.rows.map(r => r.payType))].map(t => <option key={t} value={t}>{typeLabels[t] || t}</option>)}</select></label>{data.currencyOptions.length > 1 && <label className={styles.field}>Tiền tệ<select value={currency} onChange={e => { setCurrency(e.target.value); setPage(1) }}><option value="">Tất cả (không cộng chung)</option>{data.currencyOptions.map(c => <option key={c} value={c}>{c}</option>)}</select></label>}<button type="button" className={styles.btn} onClick={() => { setQuery(''); setType(''); setTeacher(''); setPage(1); setCurrency(data.currencyOptions.length === 1 ? data.currencyOptions[0] : '') }}>Bỏ lọc</button><button type="button" className={styles.btn} onClick={() => router.refresh()}>Tải lại nguồn</button>{teacher && <button type="button" className={styles.btn} onClick={() => { setTeacher(''); setPage(1) }}>Bỏ lọc nhân sự từ liên kết</button>}</section>
    {data.evidenceError ? <div className={styles.alert} data-tone="error" role="alert"><div className={styles.fill}><strong>Không tải đủ dữ liệu đối chiếu</strong><p>Tổng ở dưới là dữ liệu đã lưu. Không xem lỗi đọc nguồn là không phát sinh hoặc số 0.</p></div><button type="button" className={styles.btn} onClick={() => router.refresh()}>Thử lại</button></div> : countIssues > 0 ? <div className={styles.alert}><span aria-hidden="true">△</span><div className={styles.fill}><strong>{countIssues} hồ sơ có dữ liệu cần đối chiếu</strong><p>{closed ? 'Kỳ đã duyệt/chốt: thay đổi mẫu không được ghi đè kết quả lịch sử.' : 'Cấu hình hiện tại có thể chưa được đưa vào kết quả. Các tổng bên dưới vẫn là bản đã tính.'}</p></div><button type="button" className={styles.btn} onClick={() => setTab('issues')}>Đối chiếu</button></div> : <p className={styles.note}>Đang xem bản đã tính. Phần kiểm tra nguồn ở đợt này đối chiếu cấu hình, không xác nhận lại toàn bộ chấm công/buổi dạy.</p>}
    {(data.missingPay.length > 0 || data.rows.some(r => r.findings.some(f => ['NEW_CONFIG','CHANGED_CONFIG'].includes(f.code)))) && <div className={styles.alert}><strong>Có cấu hình mới chưa đưa vào kết quả</strong></div>}
    <Kpis summary={summary} multiple={multiple} empty={!visible.length} currency={currencyCaption}/>
    <section className={styles.card}>
      <div className={styles.tabs} role="tablist" aria-label="Nội dung kỳ lương">{tabs.map((t, i) => <button key={t.id} type="button" id={'pay-tab-' + t.id} role="tab" aria-selected={tab === t.id} aria-controls="pay-panel" tabIndex={tab === t.id ? 0 : -1} onKeyDown={e => keyboardTab(e, i)} onClick={() => setTab(t.id)}>{t.text}{t.id === 'issues' && countIssues > 0 && <span className={styles.count}>{countIssues}</span>}</button>)}</div>
      <div id="pay-panel" role="tabpanel" aria-labelledby={'pay-tab-' + tab}>
      {tab === 'staff' && <>
        <div className={styles.cardhead}><div><h3>{visible.length} hồ sơ lương trong bộ lọc</h3><p className={styles.tiny}>Bấm tên để xem nguồn và giải thích từng khoản</p></div><span className={styles.tiny}>ĐƠN VỊ: {multiple ? 'THEO TỪNG DÒNG' : currencyCaption}</span></div>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Nhân viên / hình thức</th><th className={styles.num}>Lương tháng</th><th className={styles.num}>Tiền dạy</th><th className={styles.num}>Cộng khác</th><th className={styles.num}>BHXH+BHLĐ</th>{showOtherDeduction && <th className={styles.num}>Khấu trừ khác</th>}<th className={styles.num}>Hoàn trả</th>{showAdjustment && <th className={styles.num}>Điều chỉnh cũ ±</th>}<th className={styles.num}>Phải trả</th><th>Dữ liệu</th></tr></thead><tbody>
          {sliced.length ? sliced.map(r => <tr key={r.id}><td className={styles.employeeCell}><button type="button" className={styles.textBtn} onClick={() => setSelected(r.id)}>{r.name}</button><div className={styles.tiny}>{r.employeeCode ? r.employeeCode + ' · ' : ''}{typeLabels[r.payType] || r.payType}</div></td>{(['base', 'teaching', 'other', 'insurance', ...(showOtherDeduction ? ['otherDeductions'] : []), 'reimbursements', ...(showAdjustment ? ['adjustment'] : []), 'net'] as (keyof MoneyFields)[]).map(key => <td className={styles.num} key={key}>{key === 'net' ? <strong>{formatMoney(r[key], multiple ? r.currency : undefined)}</strong> : formatMoney(r[key], multiple ? r.currency : undefined)}</td>)}<td><button type="button" className={styles.textBtn} onClick={() => setSelected(r.id)} title={r.findings.map(f => f.message).join(' ')}><Tone tone={r.tone}>{r.label}</Tone></button></td></tr>) : <tr><td colSpan={9 + Number(showOtherDeduction) + Number(showAdjustment)} className={styles.empty}>{data.rows.length ? 'Không có nhân viên phù hợp bộ lọc.' : 'Chưa có bản tính cho kỳ này. Không có tổng lương để hiển thị.'}</td></tr>}
          {visible.length > 0 && <tr className={styles.totalrow}><td>Tổng toàn bộ bộ lọc</td>{(['base', 'teaching', 'other', 'insurance', ...(showOtherDeduction ? ['otherDeductions'] : []), 'reimbursements', ...(showAdjustment ? ['adjustment'] : []), 'net'] as (keyof MoneyFields)[]).map(key => <td className={styles.num} key={key}>{multiple ? '—' : formatMoney(summary[key])}</td>)}<td>{multiple ? 'Không cộng khác tiền tệ' : ''}</td></tr>}
        </tbody></table></div>
        <div className={styles.tableFoot}><div className={styles.row}><button type="button" className={styles.btn} disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button><span>Trang {page} / {pages}</span><button type="button" className={styles.btn} disabled={page >= pages} onClick={() => setPage(page + 1)}>Tiếp</button></div><span>Tổng theo bộ lọc gồm mọi trang · Không phải xác nhận đã chi</span></div>
      </>}
      {tab === 'sources' && <div className={styles.pad}><h3>Nguồn cấu hình và các khoản đã tính</h3><p className={styles.note}>Bộ lọc nhân viên áp dụng ở đây. Từng hồ sơ mở ra cấu hình đúng chi nhánh, khoảng hiệu lực và bản lưu nguồn khi tính; không tự suy ra tổng mới.</p>{visible.map(r => <div className={styles.issue} key={r.id}><div className={styles.fill}><strong>{r.name}</strong><p>{r.sourceAvailable ? `${r.sources.length} cấu hình giao kỳ · ${r.lines.length} dòng đã tính · ${r.actions.length} khoản phát sinh trong lịch sử` : 'Chưa đọc đủ dữ liệu nguồn; chưa xác định số dòng.'}</p><p>{r.sourceAvailable ? 'Nhấn Truy nguồn để kiểm tra giá trị và ngày hiệu lực.' : 'Nguồn chưa tải đủ.'}</p></div><button type="button" className={styles.btn} onClick={() => setSelected(r.id)}>Truy nguồn</button></div>)}{!visible.length && <p className={styles.empty}>Chưa có hồ sơ lương trong bộ lọc.</p>}{data.missingPay.length > 0 && <div className={styles.sourcebox}>{data.missingPay.length} nhân viên có cấu hình giao kỳ nhưng chưa có bản tính. Xem tab Vấn đề cần xử lý.</div>}</div>}
      {tab === 'issues' && <><div className={styles.cardhead}><div><h3>Vấn đề của toàn kỳ</h3><p className={styles.tiny}>Không giới hạn bởi bộ lọc tên · Không phải kiểm tra toàn bộ điều kiện engine</p></div></div>{!countIssues && !data.evidenceError && <p className={styles.empty}>Chưa thấy lệch cấu hình trong dữ liệu đã đọc. Chưa xác nhận lại toàn bộ buổi dạy.</p>}{issueRows.map(r => <div className={styles.issue} key={r.id}><Tone tone={r.tone}>!</Tone><div className={styles.fill}><strong>{r.name}</strong>{r.findings.filter(f => f.severity !== 'info').map((f, i) => <p key={f.code + i}>{f.message}</p>)}</div><button type="button" className={styles.btn} onClick={() => setSelected(r.id)}>Xem nguồn</button></div>)}{data.missingPay.map(r => <div className={styles.issue} key={r.employeeId}><Tone tone="warning">Mới</Tone><div className={styles.fill}><strong>{r.name}</strong><p>{r.employeeCode}</p><p>{r.message}</p></div>{!finance && <div className={styles.row}><Link className={styles.btn} prefetch={false} href={'/admin/employees/' + r.employeeId + '/compensation'}>Cấu hình</Link>{closed && <Link className={styles.btn} prefetch={false} href={'/admin/hr/retroactive-pay?source=' + data.head.id + '&employee=' + r.employeeId}>Tạo truy lĩnh</Link>}</div>}</div>)}</>}
      {tab === 'history' && <><div className={styles.cardhead}><div><h3>Lịch sử kỳ lương</h3><p className={styles.tiny}>Tối đa 50 sự kiện gần nhất · Giờ Việt Nam</p></div></div>{data.eventsError ? <p className={`${styles.pad} ${styles.stopText}`}>Không đọc được lịch sử; không đồng nghĩa chưa có thao tác.</p> : <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Thời gian</th><th>Trạng thái</th><th>Ghi chú / nguồn</th></tr></thead><tbody>{data.events.length ? data.events.map(e => <tr key={e.id}><td>{timeText(e.created_at)}</td><td>{statusLabels[e.status] || e.status}</td><td>{e.note || 'Không có ghi chú'}{e.override_reason && <p className={styles.warningText}>Ngoại lệ: {e.override_reason}</p>}<details><summary className={styles.tiny}>Thông tin truy vết</summary><p className={styles.technical}>{e.event_type || 'LEGACY'} · Người thực hiện: {e.actor_id || 'Không có mã'}</p></details></td></tr>) : <tr><td colSpan={3} className={styles.empty}>Không có sự kiện trong nguồn đã đọc.</td></tr>}</tbody></table></div>}</>}
      </div>
    </section>
    <p className={styles.note}>Lần tính gần nhất: {timeText(data.head.generated_at)}. Nguồn được đọc lúc {timeText(data.readAt)}. Thiếu dữ liệu được hiển thị “—”, không đổi thành 0.</p>
    <footer className={styles.footer}><span>VIBE Academy · Công & Lương</span><span>Bản đã tính · Đối chiếu nguồn · Xác nhận tính lại</span></footer>
    <Modal open={Boolean(detail)} onClose={() => setSelected('')} title={detail?.name || 'Truy nguồn'} subtitle={detail ? `${detail.employeeCode} · ${month} · ${data.branchName}` : ''} drawer>{detail && <Detail
        key={detail.id}
        row={detail}
        periodId={data.head.id}
        finance={finance}
        closed={closed}
        finalized={data.head.status === 'FINALIZED'}
      />}</Modal>
    <Modal open={workflowOpen} onClose={() => setWorkflowOpen(false)} title="Xem chênh lệch & tính lại" subtitle={`${month} · ${statusLabels[data.head.status] || data.head.status}`}>{workflow}</Modal>
    <Modal open={rulesOpen} onClose={() => setRulesOpen(false)} title="Quy tắc thao tác"><section className={styles.section}><h3>1. Cấu hình không phải kết quả</h3><p className={styles.small}>Các tổng trên màn này lấy từ bản tính đã lưu. Không cộng mẫu mới vào bảng cũ hoặc nhân bản thưởng/công tác phí để bù chênh lệch.</p></section><section className={styles.section}><h3>2. Nguồn phải đúng kỳ và đúng người</h3><p className={styles.small}>Khoản tháng cần hiệu lực hợp lệ; tiền dạy cần buổi đủ điều kiện. BHXH+BHLĐ chỉ nhóm cách hiển thị, không tự chuyển dữ liệu bảo hiểm.</p></section><section className={styles.section}><h3>3. Đã duyệt không đồng nghĩa đã chi</h3><p className={styles.small}>Phê duyệt, phiếu lương và chi trả là các việc riêng. Quyền và người lập/người duyệt vẫn được server/database kiểm tra.</p></section><section className={styles.section}><h3>4. Tính lại có xác nhận</h3><p className={styles.small}>Xem trước không ghi dữ liệu. Chỉ xác nhận khi nguồn hợp lệ và kỳ đang nháp. Mọi thay đổi nguồn yêu cầu xem trước lại.</p></section></Modal>
  </div>
}
