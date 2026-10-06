'use client'
import Link from 'next/link'
import { useActionState, useState, type ReactNode } from 'react'
import { saveTeaching } from './actions'
import { attendanceLabels, progressLabels, progressLabel, summary, journalLabel, sessionLabel, type Workspace, type Participant, type Progress } from './model'
import { observations } from '@/app/admin/learning-journals/types'
import { draftHomework, draftProgressNote, lessonContexts } from '@/app/admin/learning-journals/priority'
import styles from './workspace.module.css'

function SaveForm({data,p,intent,children}:{data:Workspace;p?:Participant;intent:string;children:ReactNode}) {
  const [state,action,pending] = useActionState(saveTeaching,{})
  return <form action={action}>
    <input type="hidden" name="session" value={data.id}/><input type="hidden" name="enrollment" value={p?.enrollment_id??''}/><input type="hidden" name="intent" value={intent}/>
    <fieldset disabled={pending || data.status==='CANCELLED'}>{children}</fieldset>
    <div aria-live="polite">{state.error && <p role="alert" className={styles.error}>{state.error}</p>}{state.success && <p className={styles.success}>{state.success}</p>}</div>
  </form>
}
function ProgressControl({data,p,item,kind,disabled}:{data:Workspace;p:Participant;item:Progress;kind:string;disabled:boolean}) {
  const lessonLabel = progressLabel(item)
  return <div className={styles.progress}><p>{lessonLabel} <span className={styles.badge}>{progressLabels[item.status]??item.status}</span></p>
    {item.progress_id && <SaveForm data={data} p={p} intent="progress"><input type="hidden" name="progress_id" value={item.progress_id}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="expected_status" value={item.status}/>
      <div className={styles.row}><select name="status" aria-label={`Tiến độ ${lessonLabel}`} defaultValue={item.status} disabled={disabled}>{Object.entries(progressLabels).filter(([key])=>['NOT_STARTED','IN_PROGRESS','PASS','MERIT','DISTINCTION',item.status].includes(key)).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button type="submit" disabled={disabled}>Lưu tiến độ</button></div>
    </SaveForm>}
  </div>
}
function Academic({data,p}:{data:Workspace;p:Participant}) {
  const [now] = useState(() => Date.now())
  const academic=p.academic
  const [selected,setSelected]=useState(academic?.subjects[0]?.id??'')
  if (!p.academic_readable) return <p className={styles.meta}>Hồ sơ học thuật hiện tại không thuộc phân công đang có.</p>
  if (!academic) return <p className={styles.meta}>Chưa xác định chương trình học thuật.</p>
  if (!academic.level_id) return <p className={styles.meta}>Chưa xác định cấp độ hiện tại.</p>
  const subject=academic.subjects.find(s=>s.id===selected)??academic.subjects[0]
  const future=!academic.started_at || Date.parse(academic.started_at)>now
  const disabled=future || !['PRESENT','LATE'].includes(p.attendance??'')
  return <section aria-label={`Tiến độ ${p.name}`}><h3>Tiến độ cá nhân</h3><p className={styles.meta}>{academic.name} · {academic.level_name}</p>
    {future && <p className={styles.meta}>Chưa đến ngày bắt đầu cấp độ hoặc cấp độ chưa bắt đầu.</p>}
    {!['PRESENT','LATE'].includes(p.attendance??'') && <p className={styles.meta}>Lưu điểm danh Có mặt hoặc Đi muộn để cập nhật tiến độ. Điểm danh không tự tăng tiến độ.</p>}
    <label>Môn học<select value={subject?.id??''} onChange={e=>setSelected(e.target.value)}>{academic.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    {!subject && <p>Chưa có môn học tại cấp độ này.</p>}
    {subject && <div key={subject.id}>
      {subject.rule==='ALL_REQUIRED_COMPONENTS' ? <p className={styles.meta}>Kết quả môn: {progressLabels[subject.status]??subject.status} · Tổng hợp từ nhóm đánh giá</p> : <ProgressControl data={data} p={p} item={subject} kind="subject" disabled={disabled}/>}
      {subject.components.map(component=><section key={component.id} className={styles.section}>
        {subject.rule==='ALL_REQUIRED_COMPONENTS' && <h3>Nhóm đánh giá · {component.name}</h3>}
        {component.rule==='DIRECT_ASSESSMENT' && subject.rule==='ALL_REQUIRED_COMPONENTS' && <ProgressControl data={data} p={p} item={component} kind="component" disabled={disabled}/>}
        {component.items.map(item=><ProgressControl key={item.id} data={data} p={p} item={item} kind="item" disabled={disabled}/>)}
        {!component.items.length && component.rule==='ALL_REQUIRED_ITEMS' && <p className={styles.meta}>Chưa có bài học để ghi tiến độ.</p>}
      </section>)}
    </div>}
  </section>
}
function Journal({data,p}:{data:Workspace;p:Participant}) {
  const entry=p.entry, absent=['ABSENT','EXCUSED'].includes(p.attendance??'')
  const [codes,setCodes]=useState(entry?.codes??[]),[note,setNote]=useState(entry?.progress_note??''),[homework,setHomework]=useState(entry?.individual_homework??'')
  const [parts,setParts]=useState<Record<string,string>>({})
  if (!p.attendance_id) return <section><h3>Nhật ký học viên</h3><p className={styles.meta}>Lưu điểm danh trước khi ghi nhật ký.</p></section>
  return <section aria-label={`Nhật ký ${p.name}`}><h3>Nhật ký học viên <span className={styles.badge}>{journalLabel(data,p)}</span></h3>
    <SaveForm data={data} p={p} intent="journal"><input type="hidden" name="version" value={entry?.version??0}/>
      {absent ? <><input type="hidden" name="observation" value="NOT_RECORDED"/><input type="hidden" name="progress_note" value=""/><p className={styles.meta}>Vắng / Có phép: không yêu cầu quan sát hoặc nhận xét học tập.</p></> : <>
        <label>Quan sát bắt buộc<select name="observation" defaultValue={entry?.observation??'NOT_RECORDED'}>{Object.entries(observations).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <details><summary>Chọn biểu hiện quan sát · {codes.length} đã chọn</summary><div className={styles.options}>{data.options.observations.map(option=><label key={option.code}><input type="checkbox" name="codes" value={option.code} checked={codes.includes(option.code)} onChange={e=>setCodes(e.target.checked?[...codes,option.code]:codes.filter(c=>c!==option.code))}/>{option.label_vi}</label>)}</div></details>
        <label>Nhận xét tiến độ bắt buộc<textarea name="progress_note" maxLength={4000} value={note} onChange={e=>setNote(e.target.value)}/></label>
        <button type="button" onClick={()=>setNote(draftProgressNote(data.options.observations,codes))} disabled={!codes.length}>Gợi ý từ quan sát đã chọn</button>
      </>}
      <label>Trọng tâm tiếp theo<select name="focus" defaultValue={entry?.next_focus_code??''}><option value="">Chưa chọn</option>{data.options.focus.map(o=><option key={o.code} value={o.code}>{o.label_vi}</option>)}</select></label>
      <details><summary>Gợi ý bài tập cá nhân</summary>{[['CONTENT','Nội dung'],['METHOD','Cách luyện'],['DURATION','Thời lượng'],['FREQUENCY','Tần suất']].map(([group,label])=><label key={group}>{label}<select value={parts[group]??''} onChange={e=>setParts({...parts,[group]:e.target.value})}><option value="">Chưa chọn</option>{data.options.homework.filter(o=>o.part_group===group).map(o=><option key={o.code} value={o.code}>{o.label_vi}</option>)}</select></label>)}<button type="button" onClick={()=>setHomework(draftHomework(data.options.homework,Object.values(parts)))}>Dùng bài tập gợi ý</button></details>
      <label>Bài tập về nhà<textarea name="homework" value={homework} maxLength={4000} onChange={e=>setHomework(e.target.value)}/></label><input type="hidden" name="homework_custom" value="true"/>
      <label><input type="checkbox" name="attention" defaultChecked={entry?.attention_required}/>Cần lưu ý</label>
      <label>Lý do cần lưu ý<select name="attention_reason" defaultValue={entry?.attention_reason_code??''}><option value="">Chưa chọn</option>{data.options.reasons.map(o=><option key={o.code} value={o.code}>{o.label_vi}</option>)}</select></label>
      <label>Chi tiết lưu ý<input name="attention_detail" maxLength={4000} defaultValue={entry?.attention_detail??''}/></label>
      <label>Ghi chú trao đổi với gia đình<textarea name="family_note" maxLength={4000} defaultValue={entry?.family_note??''}/></label>
      <button type="submit">{data.journal?.status==='SUBMITTED'?'Lưu chỉnh sửa nhật ký':'Lưu nháp học viên'}</button>
    </SaveForm>
  </section>
}
export default function TeachingWorkspace({data}:{data:Workspace}) {
  const counts=summary(data),time=(value:string)=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'}).format(new Date(value))
  const missing=data.participants.length-counts.marked
  return <main className={styles.workspace}>
    <Link prefetch={false} href="/operations/teacher">← Lịch dạy</Link>
      <header className={styles.card}><div className={`${styles.row} ${styles.between}`}><h1>{data.class_name}</h1><span className={styles.badge}>{sessionLabel(data)}</span></div>
      <p className={styles.meta}>{new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(data.starts_at))} · {time(data.starts_at)}–{time(data.ends_at)} · {data.room??'Chưa xếp phòng'} · {data.participants.length} học viên</p>
      <p>Giáo viên: {data.teacher??'Chưa phân công'}{data.assignment_type==='SUBSTITUTE'?' · Dạy thay':data.assignment_type==='OVERRIDE'?' · Phân công riêng':''}</p>
      <p className={styles.meta}>{data.type==='MAKEUP'?'Buổi học bù':'Buổi học thường'} · Phạm vi lớp: {data.scope_from&&data.scope_to?`${data.scope_from} → ${data.scope_to}`:'Chưa cấu hình'}</p>
    </header>
    <div className={styles.metrics}><span>Điểm danh <strong>{counts.marked}/{data.participants.length}</strong></span><span>Nhật ký đủ nội dung <strong>{counts.ready}/{counts.required}</strong></span><span>Cần lưu ý <strong>{counts.attention}</strong></span></div>
    {data.status==='CANCELLED' && <p className={styles.card}>Buổi học đã hủy. Chỉ xem thông tin, không ghi nhận thêm.</p>}
    <section className={styles.card}><h2>Nội dung chung của buổi học</h2>{data.note&&<p className={styles.meta}>{data.note}</p>}
      <SaveForm data={data} intent="context"><input type="hidden" name="version" value={data.journal?.version??0}/>
        <label>Nội dung đã dạy<textarea name="content" maxLength={4000} defaultValue={data.journal?.content_covered??''}/></label>
        <label>Bối cảnh<select name="context" defaultValue={data.journal?.curriculum_context??''}><option value="">Chưa chọn</option>{lessonContexts.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button type="submit">Lưu nội dung chung</button>
      </SaveForm>
    </section>
    <section aria-label="Các học viên trong buổi học">{data.participants.map(p=><details key={p.enrollment_id} open className={styles.card}>
      <summary aria-label={`Học viên ${p.name}`}><div className={styles.row}><h2>{p.name}</h2><strong className={styles.badge}>{p.academic?.level_name??'Chưa xác định cấp độ'}</strong>
        {p.compatibility==='OUTSIDE_SCOPE'&&<span className={`${styles.badge} ${styles.warning}`}>Ngoài phạm vi lớp</span>}
        <span className={styles.badge}>{p.attendance?attendanceLabels[p.attendance]:'Chưa điểm danh'}</span><span className={styles.badge}>{journalLabel(data,p)}</span>{p.entry?.attention_required&&!p.entry.attention_resolved_at&&<span className={`${styles.badge} ${styles.warning}`}>Cần lưu ý</span>}
      </div></summary>
      <div className={styles.section}><SaveForm data={data} p={p} intent="attendance"><div className={styles.row}>{Object.entries(attendanceLabels).map(([status,label])=><button key={status} type="submit" name="status" value={status} aria-pressed={p.attendance===status} className={p.attendance===status?styles.selected:undefined}>{label}</button>)}</div></SaveForm></div>
      <div className={styles.grid}><Academic data={data} p={p}/><Journal data={data} p={p}/></div>
    </details>)}</section>
    <section className={styles.card}><h2>Hoàn tất ca dạy</h2><p className={styles.meta}>{missing>0?`${missing} học viên chưa điểm danh.`:'Đã điểm danh đủ.'} {counts.required-counts.ready>0?`${counts.required-counts.ready} học viên cần bổ sung quan sát hoặc nhận xét.`:'Nhật ký bắt buộc đã đủ nội dung.'}</p>
      <div className={styles.row}>{data.status==='SCHEDULED'&&<SaveForm data={data} intent="complete"><button type="submit" disabled={missing>0}>Hoàn tất ca dạy</button></SaveForm>}
        <SaveForm data={data} intent="submit"><button type="submit" disabled={missing>0||counts.ready<counts.required||!data.journal?.content_covered.trim()||data.journal.status==='SUBMITTED'}>Nộp nhật ký buổi học</button></SaveForm></div>
      {data.journal?.submitted_at&&<p className={styles.meta}>Đã gửi · {counts.submitted} nhật ký học viên đủ nội dung · {data.journal.revision_count} lần chỉnh sửa</p>}
      {data.status==='COMPLETED'&&<p className={styles.meta}>{data.participants.length} học viên · {Object.entries(attendanceLabels).map(([key,label])=>`${data.participants.filter(p=>p.attendance===key).length} ${label.toLowerCase()}`).join(' · ')}</p>}
    </section>
  </main>
}
