'use client'

import { useActionState, useEffect, useState } from 'react'
import { ActionBar, EmptyState, FormField, InlineNotice, Modal, SelectField, StatusBadge } from '@/app/admin/_components/vibe'
import { normalizeYouTubeLink, type AcademicVideoLink, type VideoLinkContext, type VideoLinkResult } from '@/lib/academic-video-links'
import { removeVideoLink, saveVideoLink } from './actions'

const initial: VideoLinkResult = { ok: false, message: '' }

type Props = { studentId: string; enrollmentId: string; context: VideoLinkContext }

function Editor({ studentId, enrollmentId, context, link, onDone }: Props & { link?: AcademicVideoLink; onDone: (message: string) => void }) {
  const [state, action, pending] = useActionState(saveVideoLink, initial)
  const [level, setLevel] = useState(link?.level_id ?? '')
  const [item, setItem] = useState(link?.item_id ?? '')
  const [title, setTitle] = useState(link?.title ?? '')
  const [url, setUrl] = useState(link?.url ?? '')
  const [note, setNote] = useState(link?.note ?? '')
  const [shared, setShared] = useState(link?.shared_with_family ?? false)
  useEffect(() => { if (state.ok) onDone(state.message) }, [state, onDone])
  return <form action={action} className="space-y-4">
    <input type="hidden" name="student_id" value={studentId}/>
    <input type="hidden" name="enrollment_id" value={enrollmentId}/>
    <input type="hidden" name="id" value={link?.id ?? ''}/>
    <input type="hidden" name="version" value={link?.version ?? 0}/>
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      <FormField label="Tên video" name="title" required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Bài biểu diễn cuối tháng"/>
      <FormField label="Link video YouTube" name="url" type="url" required maxLength={2048} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…"/>
      <p className="text-sm text-[var(--vibe-muted)]">Quyền xem video do chủ video quản lý trên YouTube. Người xem có thể cần đăng nhập tài khoản đã được cấp quyền.</p>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <SelectField label="Trình độ liên quan" name="level_id" required value={level} onChange={e => { setLevel(e.target.value); setItem('') }}>
          <option value="">Chọn trình độ</option>
          {context.levels.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
        </SelectField>
        <SelectField label="Bài học liên quan" name="item_id" required disabled={!level} value={item} onChange={e => setItem(e.target.value)}>
          <option value="">Chọn Lesson bắt buộc</option>
          {context.lessons.filter(value => value.level_id === level).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
        </SelectField>
      </div>
      <label className="vibe-field"><span>Nhận xét đi kèm video</span><textarea name="note" rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} className="w-full resize-y rounded-lg border p-3"/></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="shared_with_family" checked={shared} onChange={e => setShared(e.target.checked)} className="mt-1"/><span>Hiển thị link và nhận xét cho học viên/phụ huynh được phép xem hồ sơ</span></label>
      <p className="text-xs text-[var(--vibe-muted)]">Bỏ chọn để lưu nội bộ. Lựa chọn này chỉ thay đổi hiển thị trong VIBE, không cấp hoặc thu hồi quyền trên YouTube.</p>
    </fieldset>
    {state.message && !state.ok && <InlineNotice tone="error">{state.message}</InlineNotice>}
    <ActionBar><button className="vibe-button vibe-button-primary" type="submit" disabled={pending}>{pending ? 'Đang lưu…' : 'Lưu link video'}</button></ActionBar>
  </form>
}

function RemoveForm({ studentId, enrollmentId, link, onDone }: Omit<Props, 'context'> & { link: AcademicVideoLink; onDone: (message: string) => void }) {
  const [state, action, pending] = useActionState(removeVideoLink, initial)
  useEffect(() => { if (state.ok) onDone(state.message) }, [state, onDone])
  return <form action={action} className="space-y-4">
    <p>Gỡ “{link.title}” khỏi hồ sơ học tập? Video gốc trên YouTube vẫn được giữ nguyên.</p>
    <input type="hidden" name="student_id" value={studentId}/><input type="hidden" name="enrollment_id" value={enrollmentId}/>
    <input type="hidden" name="id" value={link.id}/><input type="hidden" name="version" value={link.version}/>
    {state.message && !state.ok && <InlineNotice tone="error">{state.message}</InlineNotice>}
    <button className="vibe-button vibe-button-primary" type="submit" disabled={pending}>{pending ? 'Đang gỡ…' : 'Xác nhận gỡ link'}</button>
  </form>
}

export default function VideoLinks({ studentId, enrollmentId, context }: Props) {
  const [editing, setEditing] = useState<AcademicVideoLink | 'new' | null>(null)
  const [removing, setRemoving] = useState<AcademicVideoLink | null>(null)
  const [message, setMessage] = useState('')
  function done(value: string) { setEditing(null); setRemoving(null); setMessage(value) }

  const covered = new Set(context.links.map(link => link.item_id).filter(Boolean))
  const missing = context.lessons.filter(lesson => !covered.has(lesson.id))

  return <section className="vibe-admin vibe-card" aria-label="Video học tập">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-base font-semibold">Video học tập</h3><p className="mt-1 text-sm text-[var(--vibe-muted)]">Mỗi Lesson cần có video, gắn đúng bài học trong chương trình.</p></div>
      {context.can_manage && <button className="vibe-button" type="button" onClick={() => { setMessage(''); setEditing('new') }}>+ Thêm link video</button>}
    </div>
    {context.can_manage && <div className="mt-4 space-y-2">
      <p className="text-sm font-medium">{context.lessons.length - missing.length}/{context.lessons.length} Lesson đã có video · {missing.length} Lesson cần bổ sung</p>
      {missing.length > 0 && <details className="rounded-lg border border-[var(--vibe-line)] p-3">
        <summary className="cursor-pointer text-sm font-medium">Lesson chưa có video</summary>
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">{missing.map(lesson => <li key={lesson.id}>{context.levels.find(level => level.id === lesson.level_id)?.name} · {lesson.name}</li>)}</ul>
      </details>}
      {context.links.some(link => !link.item_id) && <InlineNotice>Video cũ chưa gắn Lesson: chọn “Sửa link” để bổ sung bài học.</InlineNotice>}
    </div>}
    {message && <InlineNotice>{message}</InlineNotice>}
    {!context.links.length && <EmptyState>Chưa có link video được chia sẻ trong mục này.</EmptyState>}
    <ul className="space-y-3">{context.links.map(link => {
      const url = normalizeYouTubeLink(link.url)
      return <li key={link.id} className="min-w-0 rounded-lg border border-[var(--vibe-line)] bg-[var(--vibe-surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1"><p className="break-words font-semibold">{link.title}</p><p className="mt-1 break-words text-xs text-[var(--vibe-muted)]">{[link.level_name, link.lesson_name].filter(Boolean).join(' · ') || 'Video của chương trình'}</p></div>
          {context.can_manage && <StatusBadge tone={link.shared_with_family ? 'success' : 'neutral'}>{link.shared_with_family ? 'Chia sẻ với gia đình' : 'Nội bộ'}</StatusBadge>}
        </div>
        {link.note && <p className="mt-3 whitespace-pre-wrap break-words text-sm">{link.note}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {url ? <a className="vibe-button" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Xem video: ${link.title} (mở tab mới)`}>Xem video ↗</a> : <p role="alert">Link video không hợp lệ.</p>}
          {context.can_manage && <><button type="button" className="vibe-button" onClick={() => { setMessage(''); setEditing(link) }}>Sửa link</button><button type="button" className="vibe-button" onClick={() => { setMessage(''); setRemoving(link) }}>Gỡ link</button></>}
        </div>
      </li>
    })}</ul>
    {context.links.length > 0 && <p className="text-xs text-[var(--vibe-muted)]">Video mở trên YouTube. Nếu video riêng tư, hãy đăng nhập đúng tài khoản Google được chủ video cấp quyền.</p>}
    {context.can_manage && <>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Thêm link video' : 'Sửa link video'}>
        {editing && <Editor key={editing === 'new' ? 'new' : `${editing.id}-${editing.version}`} studentId={studentId} enrollmentId={enrollmentId} context={context} link={editing === 'new' ? undefined : editing} onDone={done}/>}
      </Modal>
      <Modal open={removing !== null} onClose={() => setRemoving(null)} title="Gỡ link video">
        {removing && <RemoveForm key={removing.id} studentId={studentId} enrollmentId={enrollmentId} link={removing} onDone={done}/>}
      </Modal>
    </>}
  </section>
}
