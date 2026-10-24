import { RecoveryControls } from './RecoveryControls';
import { readRecovery } from '@/lib/integrations/zalo/registration-recovery';
import { zaloServiceClient } from '@/lib/integrations/zalo/service';
import Link from 'next/link';
import { AppPage, PageHeader, SectionCard, InlineNotice, StatusBadge } from '@/app/admin/_components/vibe';
import { requireIntegrationAdmin } from '../access';
import { zaloRecoveryMessage, zaloNotificationLabel } from '@/lib/integrations/zalo/recovery-labels';
import { readZaloConnectionView } from '@/lib/integrations/zalo/service';
import { checkConnection, confirmOwnerReceipt } from './actions';

const date = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) + ' (UTC+7)' : 'Chưa ghi nhận';
export async function RegistrationRecovery({ searchParams }: {
    searchParams: Promise<{
        result?: string;
        job?: string;
    }>;
}) {
    const db = await requireIntegrationAdmin(), query = await searchParams;
    const [{ data: jobs, error }, connectionView] = await Promise.all([
        db.from('notification_jobs').select('id,entity_id,status,error_code,attempts,sent_at,delivered_at,lease_until,provider_message_id,payload').eq('channel', 'ZALO').eq('entity_type', 'REGISTRATION_COMPLETED').order('created_at', { ascending: false }).limit(30),
        readZaloConnectionView(),
    ]);
    const ids = (jobs ?? []).map(j => j.entity_id), jobIds = (jobs ?? []).map(j => j.id);
    const [{ data: apps }, { data: attempts }, { data: events }, { data: receipts }] = await Promise.all([
        ids.length ? db.from('registration_applications').select('id,application_code').in('id', ids) : Promise.resolve({ data: [] }),
        jobIds.length ? db.from('zalo_notification_attempts').select('id,job_id,attempt_number,state,started_at,completed_at,http_status,provider_error,provider_message_id').in('job_id', jobIds).order('attempt_number') : Promise.resolve({ data: [] }),
        jobIds.length ? db.from('notification_events').select('id,job_id,event,created_at,details').in('job_id', jobIds).order('created_at') : Promise.resolve({ data: [] }),
        jobIds.length ? db.from('zalo_owner_receipts').select('job_id,confirmed_at').in('job_id', jobIds) : Promise.resolve({ data: [] }),
    ]);
    const recoveryViews = new Map(await Promise.all((jobs ?? []).map(async job => [job.id, await readRecovery(db, zaloServiceClient(), job.id)] as const)));
    const codes = new Map((apps ?? []).map(a => [a.id, a.application_code]));
    const { metadata: credential, readError: credentialReadError, ready: connected } = connectionView;
    const health = credentialReadError ? 'Không đọc được kết nối' : connected ? 'Kết nối sẵn sàng' : credential?.state === 'REFRESHING' ? 'Đang cập nhật kết nối' : credential?.state === 'UNCERTAIN' ? 'Cần đối soát việc đổi khóa' : 'Cần cập nhật kết nối';
    return <AppPage>
   <PageHeader title="Kết nối Zalo" description="Thanh toán và đăng ký được theo dõi độc lập với kết quả gửi tin cho khách." actions={<Link className="vibe-button" href="/admin/system/integrations">Tích hợp</Link>}/>
   {query.result && <InlineNotice tone={['READY', 'ACCEPTED', 'ALREADY_ACCEPTED', 'OWNER_RECEIPT_RECORDED'].includes(query.result) ? 'success' : 'error'}>{zaloRecoveryMessage(query.result)}</InlineNotice>}
   <SectionCard title="Tình trạng kết nối">
     <StatusBadge tone={connected ? 'success' : 'warning'}>{health}</StatusBadge>
     <p className="mt-3 break-words">Ứng dụng: {process.env.ZALO_APP_ID || 'Chưa cấu hình'} · OA: {process.env.ZALO_OA_ID || 'Chưa cấu hình'} · Mẫu: 640377</p>
     <p className="mt-2">Phiên bản khóa: {credential?.version ?? 'Chưa khởi tạo'} · Hạn khóa: {date(credential?.expires_at ?? null)}</p>
     {!connected && <p className="mt-3">{zaloRecoveryMessage(credentialReadError ? 'ZALO_CREDENTIAL_STORE_UNAVAILABLE' : credential?.error_code ?? 'ZALO_REFRESH_TOKEN_MISSING')}</p>}
     <p className="mt-2">Gia hạn thành công gần nhất: {date(credential?.last_refreshed_at ?? null)}</p>
     <p className="mt-2">Lịch kiểm tra tiếp theo: {date(connectionView.scheduler?.next_check_at ?? null)}</p>
     <p className="mt-2">Lịch nền: {connectionView.schedulerAlive ? 'Đang hoạt động' : 'Chưa ghi nhận hoặc đã trễ'} · Kiểm tra gần nhất: {date(connectionView.scheduler?.checked_at ?? null)}</p>
     {(!connected || (connectionView.scheduler && connectionView.scheduler.result !== 'READY')) && <InlineNotice tone="warning">Cần quản trị viên kiểm tra kết nối. Thông báo này hiển thị trong hệ thống, không phụ thuộc Zalo. {connectionView.scheduler?.result === 'OWNERSHIP_UNCONFIRMED' ? 'Chưa xác nhận MAIN là nơi duy nhất gia hạn token.' : ''}</InlineNotice>}
     {(connectionView.checks ?? []).map(check => <InlineNotice key={check.source} tone={check.result === 'READY' ? 'success' : 'warning'}><p>{check.source === 'MAIN' ? 'Kho token của ứng dụng hiện tại' : 'Token tham chiếu từ workspace CRM cũ (không phải kết nối của ứng dụng hiện tại)'} · {date(check.checked_at)}</p><p>{zaloRecoveryMessage(check.result)}{check.http_status != null ? ` · API OA: HTTP ${check.http_status}, mã Zalo ${check.provider_error}` : ' · Chưa gọi API vì không có token'}</p></InlineNotice>)}
     <p className="mt-3">Gia hạn tự động chỉ thực hiện khi đã xác định nơi quản lý token dùng chung. Khi cần cấp quyền lại, chọn “Kết nối lại Zalo”; cặp khóa mới được lưu an toàn trên máy chủ. Không cần sửa cấu hình hoặc khởi động lại cho mỗi lần gia hạn.</p>
     <p className="mt-3">Kiểm tra kết nối không gửi tin. Lịch nền chỉ chạy khi máy Mac bật và không ngủ.</p>
     <div className="vibe-actions mt-4">
       <form action={checkConnection}><button type="submit" className="vibe-button">Kiểm tra kết nối (không gia hạn)</button></form>
       <form action="/api/integrations/zalo/oauth/start" method="post"><button type="submit" className="vibe-button">{credential ? 'Kết nối lại Zalo' : 'Kết nối Zalo'}</button></form>
     </div>
   </SectionCard>
   <SectionCard title="Thông báo đăng ký">
     <p className="mb-4">Chỉ gửi lại từng thông báo có bằng chứng bị từ chối hoặc chưa gọi gửi. Tin đã được chấp nhận, đã phát hoặc chưa rõ kết quả cần được đối soát.</p>
     {error && <InlineNotice tone="error">Không tải được danh sách thông báo.</InlineNotice>}
     <div className="grid gap-4">{(jobs ?? []).map(job => {
            const history = (attempts ?? []).filter(a => a.job_id === job.id), legacy = (events ?? []).filter(e => e.job_id === job.id && !e.details?.attempt_id);
            const owner = (receipts ?? []).find(r => r.job_id === job.id);
            const phone = String(job.payload?.delivery?.normalized_recipient ?? '');
            return <article key={job.id} id={job.id} className="vibe-card">
         <div className="flex flex-wrap items-center justify-between gap-3"><Link className="font-semibold break-words" href={`/admin/business/registrations/${job.entity_id}`}>{codes.get(job.entity_id) ?? 'Mở hồ sơ'}</Link><StatusBadge tone={job.delivered_at ? 'success' : job.error_code ? 'error' : 'warning'}>{zaloNotificationLabel(job)}</StatusBadge></div>
         <p className="mt-3">Số nhận: {phone ? phone.slice(0, 4) + '…' + phone.slice(-3) : 'Snapshot chưa cập nhật; xem số đã đồng ý bên dưới'} · {job.payload?.parameters?.payment_status ?? 'Chưa xác định'} · Đã thử {job.attempts}/5 lần</p>
         {job.error_code && <p className="mt-2">{zaloRecoveryMessage(job.error_code)}</p>}
         <p className="mt-2">Zalo chấp nhận: {date(job.sent_at)} · Webhook xác nhận phát: {date(job.delivered_at)}</p>
         <p className="mt-2">Khách xác nhận đã nhận: {date(owner?.confirmed_at ?? null)}</p>
         <div className="vibe-actions mt-4">
           {!owner && ['SENT', 'DELIVERED', 'ACCEPTANCE_UNKNOWN'].includes(job.status) && <form action={confirmOwnerReceipt}><input type="hidden" name="job_id" value={job.id}/><button type="submit" className="vibe-button">Ghi nhận khách xác nhận đã nhận</button></form>}
         </div>
         <RecoveryControls initial={recoveryViews.get(job.id)!} />
         <details className="mt-4" open={query.job === job.id}><summary className="cursor-pointer font-semibold">Lịch sử gửi và đối soát</summary>
           <p className="mt-2 text-sm break-all">Mã thông báo: {job.id}</p>
           {legacy.map(event => <p className="mt-2 text-sm" key={event.id}>{date(event.created_at)} · {event.event === 'CREATED' ? 'Tạo thông báo' : event.event === 'FAILED' ? 'Ghi nhận lỗi gửi' : event.event === 'RETRY' ? (event.details?.source === 'CHANNEL_REEVALUATION' ? 'Cập nhật kênh nhận tin · chưa gọi gửi' : 'Yêu cầu gửi lại') : event.event === 'BLOCKED' ? 'Chặn trước khi gửi' : event.event} {event.details?.provider_error != null ? `· Mã Zalo ${event.details.provider_error}` : ''}{event.event === 'FAILED' ? ' · Bản cũ chưa lưu HTTP status và mã lần gọi.' : ''}</p>)}
           {history.map(a => <div className="mt-3 text-sm" key={a.id}><p>Lần {a.attempt_number} · {date(a.started_at)} · {a.state === 'ACCEPTED' ? 'Zalo chấp nhận' : a.state === 'REJECTED' ? 'Zalo từ chối' : a.state === 'UNKNOWN' ? 'Chưa rõ kết quả' : 'Chưa ghi nhận phản hồi'}</p><p>HTTP: {a.http_status ?? 'Không ghi nhận'} · Mã Zalo: {a.provider_error ?? 'Không ghi nhận'} · Kết thúc: {date(a.completed_at)}</p><p className="break-all">Mã lần gọi: {a.id} · Mã tin Zalo: {a.provider_message_id ?? 'Không có'}</p></div>)}
         </details>
       </article>;
        })}</div>
   </SectionCard>
 </AppPage>;
}
