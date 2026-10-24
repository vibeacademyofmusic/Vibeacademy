export function zaloRecoveryMessage(code?: string | null) {
    const labels: Record<string, string> = {
        CHANNEL_READY: 'Kênh nhận tin đã được cập nhật. Chỉ gửi khi bạn chọn Gửi thông báo và kiểm tra cuối cùng đạt yêu cầu.',
        CHANNEL_SNAPSHOT_REQUIRED: 'Đã có đồng ý nhận tin; chọn Kiểm tra lại điều kiện để cập nhật thông báo cũ.',
        RECOVERY_FORBIDDEN: 'Bạn không có quyền phục hồi thông báo này. Cần quản trị viên có quyền trên hồ sơ.',
        STALE_ACTION: 'Thông báo đã được xử lý từ phiên khác. Trạng thái mới đã được tải; không gửi thêm.',
        DELIVERED: 'Webhook đã xác nhận phát tin.',
        GATE_DISABLED: 'Cổng gửi mẫu tin đang tắt. Mẫu được duyệt không đồng nghĩa đã bật gửi.',
        PHONE_CONSENT_REQUIRED: 'Cần xác nhận phụ huynh đã đồng ý nhận thông báo cho đúng số điện thoại.',
        PHONE_INVALID: 'Số điện thoại chưa hợp lệ. Nhập số Việt Nam gồm 10 chữ số hoặc bắt đầu bằng 84.',
        SKIPPED_NO_CHANNEL: 'Chưa có kênh nhận tin hợp lệ. Cần kiểm tra thông tin và xác nhận nhận tin.',
        ZALO_CALLBACK_NOT_CONFIGURED: 'Chưa cấu hình địa chỉ nhận kết quả cấp quyền. Quản trị viên cần xác nhận callback của pilot, không thay callback production.',
        ZALO_OWNERSHIP_UNCONFIRMED: 'Chưa xác nhận MAIN là nơi duy nhất quản lý gia hạn cho ứng dụng và OA này.',
        ZALO_OAUTH_INVALID: 'Phiên cấp quyền không hợp lệ, hết hạn hoặc đã dùng. Bắt đầu kết nối lại từ màn hình này.',
        ZALO_OAUTH_EXCHANGE_UNCERTAIN: 'Chưa rõ kết quả cấp quyền. Không dùng lại mã cũ; cần bắt đầu kết nối lại.',
        ZALO_MAIN_CREDENTIAL_MISSING: 'Kho token của hệ thống chính chưa có access token. Chưa thể kiểm chứng kết nối của hệ thống này.',
        ZALO_ACCESS_EXPIRED: 'API Zalo xác nhận access token đã hết hạn (-216). Cần lấy token từ nơi quản lý chung hoặc gia hạn tại đúng nơi đó.',
        READY: 'Kết nối hợp lệ, đã xác minh OA và quyền truy cập mẫu tin. Mỗi thông báo vẫn cần đủ điều kiện gửi.',
        ACCEPTED: 'Zalo đã chấp nhận tin. Chưa có xác nhận phát tới khách hàng.',
        ALREADY_ACCEPTED: 'Tin đã được Zalo chấp nhận; hệ thống không gửi lại.',
        ZALO_TOKEN_INVALID: 'Zalo từ chối khóa truy cập (-124). Cần cập nhật kết nối; mã này không xác định được nguyên nhân hết hạn hay thu hồi.',
        ZALO_PROOF_INVALID: 'Chữ ký appsecret_proof không hợp lệ (ZBS: -1241; OA: -242). Kiểm tra khóa bí mật ứng dụng và cặp khóa OA.',
        ZALO_REFRESH_TOKEN_MISSING: 'Chưa có refresh token. Chọn Kết nối Zalo để cấp quyền qua trang chính thức.',
        ZALO_RECONNECT_REQUIRED: 'Cần cấp quyền lại cho đúng ứng dụng và OA, chọn Kết nối lại Zalo.',
        ZALO_REFRESH_BUSY: 'Một tiến trình đang cập nhật kết nối. Chờ hoàn tất rồi kiểm tra lại.',
        ZALO_REFRESH_UNCERTAIN: 'Chưa rõ kết quả đổi khóa. Hệ thống đã khóa việc dùng lại refresh token; quản trị viên cần đối soát hoặc cấp quyền lại.',
        ZALO_CREDENTIAL_CHANGED: 'Kết nối vừa được cập nhật ở phiên khác. Tải lại trang trước khi thao tác.',
        ZALO_OUTBOUND_NOT_CONFIGURED: 'Thiếu cấu hình kết nối Zalo trên máy chủ.',
        ZALO_CREDENTIAL_STORE_UNAVAILABLE: 'Không truy cập được kho khóa Zalo. Chưa gửi tin; kiểm tra cơ sở dữ liệu.',
        ZALO_CONNECTION_UNAVAILABLE: 'Chưa kiểm tra được Zalo. Kiểm tra kết nối mạng trước khi thử lại.',
        ZALO_OA_VERIFICATION_FAILED: 'Chưa xác minh được danh tính OA. Kiểm tra quyền truy cập thông tin OA.',
        ZALO_OA_MISMATCH: 'Khóa thuộc OA khác với cấu hình. Không sử dụng khóa này để gửi tin.',
        ZALO_RETRY_DENIED: 'Không đủ điều kiện gửi lại: tin đã xử lý, chưa rõ kết quả hoặc đã đạt giới hạn 5 lần.',
        ZALO_ACCEPTANCE_UNKNOWN: 'Chưa rõ Zalo đã nhận yêu cầu hay chưa. Cần đối soát trước khi gửi lại để tránh trùng tin.',
        PAYLOAD_REJECTED: 'Thông tin hồ sơ hoặc mẫu tin đã thay đổi. Cần đối soát nội dung trước khi gửi.',
        WRONG_RECIPIENT: 'Số nhận tin hiện tại khác số đã được chấp thuận. Cần đối soát.',
        ZALO_CONSENT_WITHDRAWN: 'Sự đồng ý đã thay đổi trước khi gửi. Yêu cầu bị chặn tại hệ thống, chưa gọi Zalo.',
        CONSENT_RECORDED: 'Đã lưu đồng ý. Chỉ có thể gửi sau khi hồ sơ và khoản thu đủ điều kiện.',
        CONSENT_REVOKED: 'Đã ghi nhận rút đồng ý. Những lần gửi tiếp theo bị chặn; tin đã gửi không thể thu hồi.',
        PHONE_CONSENT_STALE: 'Thông tin đồng ý đã thay đổi. Hãy tải lại hồ sơ trước khi thao tác.',
        PHONE_CONSENT_SOURCE_REQUIRED: 'Chọn nguồn xác nhận thực tế của phụ huynh.',
        PHONE_CONSENT_INVALID: 'Thao tác ghi nhận đồng ý không hợp lệ.',
        NO_CONSENT: 'Chưa có xác nhận đồng ý nhận tin hợp lệ cho số nhận tin.',
        NOT_SENDABLE: 'Thông báo chưa đủ điều kiện gửi.',
        OWNER_RECEIPT_RECORDED: 'Đã ghi nhận lời xác nhận nhận tin của khách. Bằng chứng webhook được theo dõi riêng.',
    };
    if (!code)
        return null;
    if (code.startsWith('ZALO_OA_PROVIDER_'))
        return `API OA từ chối yêu cầu (${code.slice(17)}). Kiểm tra quyền OA, ứng dụng và hạn mức; không tự kết luận khóa hết hạn.`;
    const specific: Record<string, string> = { '-117': 'Ứng dụng hoặc OA chưa có quyền sử dụng mẫu tin.', '-115': 'Tài khoản ZBS không đủ số dư.', '-144': 'Đã đạt hạn mức gửi trong ngày.', '-147': 'Mẫu tin đã đạt hạn mức gửi trong ngày.', '-118': 'Số điện thoại chưa có tài khoản Zalo hoạt động.', '-139': 'Khách từ chối loại thông báo này.', '-141': 'Khách từ chối nhận tin từ OA.', '-131': 'Mẫu tin chưa được duyệt.', '-138': 'Ứng dụng chưa được cấp quyền gửi tin theo số điện thoại.' };
    return labels[code] ?? (code.startsWith('ZALO_PROVIDER_') ? `${specific[code.slice(14)] ?? 'Zalo từ chối yêu cầu. Kiểm tra quyền, mẫu tin, người nhận và hạn mức.'} (${code.slice(14)})` : 'Chưa xử lý được thông báo. Kiểm tra lịch sử và kết nối trước khi thử lại.');
}
export function zaloNotificationLabel(job: {
    status: string;
    error_code?: string | null;
    lease_until?: string | null;
}) {
    if (job.status === 'SKIPPED_NO_CHANNEL')
        return job.error_code === 'GATE_DISABLED' ? 'Chưa gửi · cổng gửi đang tắt' : 'Chưa gửi · cần kiểm tra kênh nhận';
    if (job.status === 'DELIVERED')
        return 'Webhook xác nhận đã phát';
    if (job.status === 'SENT')
        return 'Zalo đã chấp nhận';
    if (job.status === 'ACCEPTANCE_UNKNOWN' || (job.status === 'PROCESSING' && (!job.lease_until || Date.parse(job.lease_until) < Date.now())))
        return 'Chưa rõ kết quả · cần đối soát';
    if (job.status === 'PROCESSING')
        return 'Đang gửi';
    if (job.status === 'FAILED')
        return ['ZALO_TOKEN_INVALID', 'ZALO_PROOF_INVALID', 'ZALO_TOKEN_EXPIRED'].includes(job.error_code ?? '') ? 'Bị chặn do kết nối' : 'Gửi lỗi · cần kiểm tra';
    if (job.error_code?.startsWith('ZALO_'))
        return 'Chờ cập nhật kết nối';
    if (job.status === 'CANCELLED')
        return 'Đã hủy';
    return 'Đang chờ gửi';
}
