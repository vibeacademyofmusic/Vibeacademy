# VIBE Academy — Hồ sơ giả lập & kiểm thử Academic / Nhật ký / Báo cáo / Phản hồi / Zalo

Ngày chuẩn bị: 28/09/2026, Asia/Ho_Chi_Minh.
Trạng thái: READY FOR LOCAL EXECUTION — NOT RUN.
Tài liệu này chứa dữ liệu fixture, yêu cầu triển khai, nội dung mẫu tin và 59 ca kiểm thử. Chưa có hồ sơ nào được ghi vào VIBE System từ phiên soạn này, chưa gọi API gửi tin, chưa có kết quả PASS thực tế.

## Mục tiêu thực thi

Tạo một hành trình hoàn chỉnh cho học sinh giả lập S1 và các hồ sơ phụ để thử đủ quyền/quan hệ/nhạc cụ:
Hồ sơ học sinh → phụ huynh liên kết → chương trình/level → xếp lớp → buổi học/điểm danh → Academic Progress → nhật ký → báo cáo tháng/cuối khóa → phụ huynh đặt câu hỏi → nhân sự trả lời/xử lý → phản hồi buổi học → thông báo Zalo và tải PDF.

Phạm vi hiện tại là local repo của Owner, đúng ứng dụng tại localhost:3000. Bản GitHub được đọc ở bước trước chỉ mới cập nhật 15/09/2026; không thay thế bằng bản đó khi repo local đã có các thay đổi mới.

## Lệnh giao việc cho Codex tại repo local

Hãy tạo dữ liệu kiểm thử dưới đây, kiểm tra toàn bộ luồng qua giao diện và API/database, sửa lỗi trong phạm vi này, chạy lại ca lỗi và báo kết quả có bằng chứng. Không dừng ở việc viết kế hoạch nếu môi trường cho phép thực thi.

1. Đọc AGENTS.md; xác minh repo/branch/CWD/DB của cổng 3000. Giữ thay đổi đang có và cổng 3000. Không chạy bản preview ở cổng khác.
2. Audit routes, Server Actions/RPC, RLS và enum/status thực tế của từng module trước khi viết test/migration. Các trạng thái trong tài liệu có ghi “đề xuất” không được giả định đã tồn tại.
3. Kiểm tra 4 chương trình vừa yêu cầu đã được tạo thực sự chưa. Nếu chưa, dùng đặc tả VIBE_Curriculum_4_Programs_Codex.md đã chốt, thực hiện phần đủ điều kiện; báo riêng mọi curriculum dependency còn thiếu.
4. Tạo test_run_id, fixture idempotent và bảng mapping ref→ID thật. Dùng các tài khoản thử riêng, mật khẩu ngẫu nhiên tạo tại local; không dùng tài khoản của học viên thật và không gửi email mời tới người thật.
5. Tạo dữ liệu qua luồng nghiệp vụ hiện có. Chỉ dùng fixture helper cho bước nền cần thiết; không bypass RLS bằng service role rồi gọi đó là kiểm thử phân quyền.
6. Thực hiện luồng chính bằng Teacher, Student, Parent và Admin tương ứng. SUPER_ADMIN không được dùng thay mọi actor.
7. Nếu thiếu tính năng trả lời/xử lý hoặc notification integration, triển khai phần thiếu theo các mục dưới đây; tái sử dụng queue/token/notification service hiện có.
8. Nếu cần schema mới cho phần được yêu cầu, dùng migration additive, local-only, review diff; không reset DB, không push/migrate production, không tắt RLS. Không sửa schema/progress engine chỉ để ép test PASS.
9. Test với mock transport trước, sau đó integration thật nếu đủ recipient/template/URL/consent/quota đã cho phép. Không dừng các kiểm thử nội bộ chỉ vì Zalo live bị block.
10. Giữ fixture để Owner kiểm tra; tạo cleanup có mục tiêu, không tự xóa ngay sau khi chụp hình.
11. Không deploy, không tạo tunnel công khai hay mở production chỉ để làm link Zalo hoạt động. Nếu chưa có HTTPS endpoint phù hợp đã được phép sử dụng, đánh dấu phần live-download BLOCKED.
12. Không tác động giao dịch học phí, payOS, chi trả giáo viên thật. Dữ liệu phụ trợ phát sinh từ fixture phải thuộc đúng test run, không lẫn vào dữ liệu vận hành thật.

## Hồ sơ giả lập

Tất cả tên dưới đây là dữ liệu hư cấu, có nhãn TEST VIBE. Không điền số điện thoại ngẫu nhiên có thể thuộc về người thật. UID/SĐT gửi thử được cấu hình riêng sau khi xác minh.

- S1 là ca chính: Piano Grade 1, branch A, Parent P1.
- S2 là em/chị cùng Parent P1: Piano Pre Step, thử chọn con và không nhầm báo cáo.
- S3: Drums Pre, Parent P2 chưa đồng ý nhận tin, dùng để kiểm tra chặn gửi.
- S4: Guitar Grade 4, branch B, kiểm tra Ensemble và phạm vi chi nhánh.
- S5: Violin Grade 7, kiểm tra các môn nâng cao.

Dữ liệu JSON này là manifest nghiệp vụ, không phải schema DB. Ánh xạ field/ref/status vào schema thực tế. Với run mới, thêm suffix run_id vào email/username; không lưu password vào manifest.

```json
{
  "fixture_type": "schema_neutral_test_plan",
  "execution_status": "NOT_RUN",
  "base_run_id": "VIBE-E2E-ACA-20260928",
  "timezone": "Asia/Ho_Chi_Minh",
  "primary_student": "S1",
  "branches": {
    "A": "Resolve existing authorized local branch A",
    "B": "Resolve different local branch B"
  },
  "students": [
    {
      "ref": "S1",
      "display_name": "TEST VIBE — Minh An",
      "branch": "A",
      "program": "Piano",
      "level": "Grade 1",
      "parent_ref": "P1",
      "email_example": "vibe.e2e.s1@example.test",
      "phone": null,
      "purpose": "Full academic/journal/report/feedback journey"
    },
    {
      "ref": "S2",
      "display_name": "TEST VIBE — Bảo Nhi",
      "branch": "A",
      "program": "Piano",
      "level": "Pre Step",
      "parent_ref": "P1",
      "email_example": "vibe.e2e.s2@example.test",
      "phone": null,
      "purpose": "Sibling isolation and foundation level"
    },
    {
      "ref": "S3",
      "display_name": "TEST VIBE — Gia Huy",
      "branch": "A",
      "program": "Drums",
      "level": "Pre",
      "parent_ref": "P2",
      "email_example": "vibe.e2e.s3@example.test",
      "phone": null,
      "purpose": "No messaging consent negative case"
    },
    {
      "ref": "S4",
      "display_name": "TEST VIBE — Khánh Linh",
      "branch": "B",
      "program": "Guitar",
      "level": "Grade 4",
      "parent_ref": "P3",
      "email_example": "vibe.e2e.s4@example.test",
      "phone": null,
      "purpose": "Cross-branch isolation and Ensemble"
    },
    {
      "ref": "S5",
      "display_name": "TEST VIBE — Tuệ Minh",
      "branch": "A",
      "program": "Violin",
      "level": "Grade 7",
      "parent_ref": "P4",
      "email_example": "vibe.e2e.s5@example.test",
      "phone": null,
      "purpose": "Advanced grade subjects smoke test"
    }
  ],
  "parents": [
    {
      "ref": "P1",
      "display_name": "TEST VIBE — Phụ huynh Minh An/Bảo Nhi",
      "children": [
        "S1",
        "S2"
      ],
      "live_zalo_recipient_ref": null
    },
    {
      "ref": "P2",
      "display_name": "TEST VIBE — Phụ huynh Gia Huy",
      "children": [
        "S3"
      ],
      "live_zalo_recipient_ref": null,
      "messaging_consent": false
    },
    {
      "ref": "P3",
      "display_name": "TEST VIBE — Phụ huynh Khánh Linh",
      "children": [
        "S4"
      ],
      "live_zalo_recipient_ref": null
    },
    {
      "ref": "P4",
      "display_name": "TEST VIBE — Phụ huynh Tuệ Minh",
      "children": [
        "S5"
      ],
      "live_zalo_recipient_ref": null
    }
  ],
  "actors": [
    "SUPER_ADMIN test operator",
    "BRANCH_ADMIN A test",
    "BRANCH_ADMIN B test",
    "ACADEMIC_ADMIN test",
    "TEACHER T1 actual teacher",
    "TEACHER T2 substitute on one fixture session",
    "TEACHER T3 unrelated",
    "STUDENT S1",
    "PARENT P1",
    "PARENT P2"
  ],
  "s1_monthly_period": {
    "from": "2026-09-01",
    "to": "2026-09-30",
    "label": "September 2026 — test fixture; period not yet closed at preparation"
  },
  "s1_sessions": [
    {
      "ref": "S1-0903",
      "starts_at": "2026-09-03T18:00:00+07:00",
      "ends_at": "2026-09-03T19:00:00+07:00",
      "session_status": "COMPLETED",
      "attendance": "PRESENT",
      "actual_teacher": "T1"
    },
    {
      "ref": "S1-0907",
      "starts_at": "2026-09-07T18:00:00+07:00",
      "ends_at": "2026-09-07T19:00:00+07:00",
      "session_status": "COMPLETED",
      "attendance": "PRESENT",
      "actual_teacher": "T1"
    },
    {
      "ref": "S1-0910",
      "starts_at": "2026-09-10T18:00:00+07:00",
      "ends_at": "2026-09-10T19:00:00+07:00",
      "session_status": "COMPLETED",
      "attendance": "PRESENT",
      "actual_teacher": "T2"
    },
    {
      "ref": "S1-0914",
      "starts_at": "2026-09-14T18:00:00+07:00",
      "ends_at": "2026-09-14T19:00:00+07:00",
      "session_status": "COMPLETED",
      "attendance": "PRESENT",
      "actual_teacher": "T1"
    },
    {
      "ref": "S1-0917",
      "starts_at": "2026-09-17T18:00:00+07:00",
      "ends_at": "2026-09-17T19:00:00+07:00",
      "session_status": "COMPLETED",
      "attendance": "LATE",
      "actual_teacher": "T1"
    },
    {
      "ref": "S1-0921",
      "starts_at": "2026-09-21T18:00:00+07:00",
      "ends_at": "2026-09-21T19:00:00+07:00",
      "session_status": "COMPLETED",
      "attendance": "ABSENT",
      "actual_teacher": "T1"
    },
    {
      "ref": "S1-0924",
      "starts_at": "2026-09-24T18:00:00+07:00",
      "ends_at": "2026-09-24T19:00:00+07:00",
      "session_status": "CANCELLED",
      "attendance": null,
      "actual_teacher": "T1"
    },
    {
      "ref": "S1-0928",
      "starts_at": "2026-09-28T18:00:00+07:00",
      "ends_at": "2026-09-28T19:00:00+07:00",
      "session_status": "SCHEDULED",
      "attendance": null,
      "actual_teacher": "T1"
    }
  ],
  "expected_completed_attendance": {
    "present": 4,
    "late": 1,
    "absent": 1,
    "excused": 0,
    "completed_total": 6,
    "attended_total": 5
  },
  "journal_example": {
    "observation": "Map to an allowed existing observation enum; do not insert this instruction as a DB value.",
    "progress_note": "Học sinh giữ nhịp ổn định hơn khi chơi chậm; phần chuyển ngón còn cần luyện riêng.",
    "strengths": "Chủ động đếm phách và sửa lỗi sau hướng dẫn.",
    "areas_to_improve": "Giữ nhịp đều tại chỗ chuyển ngón.",
    "homework": "Ôn đoạn đang học với tốc độ chậm, chia thành từng nhóm ngắn.",
    "attention_required": false
  },
  "report_question": "Xin giáo viên hướng dẫn cách luyện ở nhà để con giữ nhịp đều hơn.",
  "report_public_reply": "Gia đình hỗ trợ con đếm phách thành tiếng và luyện từng đoạn ngắn ở tốc độ chậm. Giáo viên sẽ kiểm tra lại trong buổi học kế tiếp.",
  "feedback_example": {
    "session_ref": "S1-0917",
    "student_ref": "S1",
    "author_ref": "P1",
    "rating": 2,
    "comment": "Phần bài tập về nhà chưa rõ; gia đình cần được hướng dẫn cụ thể hơn."
  },
  "feedback_public_reply": "Vibe đã ghi nhận phản hồi. Giáo viên đã bổ sung hướng dẫn luyện tập cho buổi học này và sẽ kiểm tra lại mức độ phù hợp ở buổi kế tiếp.",
  "internal_note_example": "TEST INTERNAL ONLY — giao người phụ trách kiểm tra chất lượng hướng dẫn; không đưa vào portal, PDF hoặc tin Zalo.",
  "live_send": {
    "mode": "MOCK_UNTIL_VALIDATED",
    "recipient": null,
    "consent_evidence": null,
    "template_ids": {},
    "public_base_url": null
  }
}
```

Lưu ý về ngày:
- Tại thời điểm chuẩn bị, tháng 09/2026 chưa kết thúc. Nếu policy không cho phát hành báo cáo tháng đang diễn ra, kiểm thử draft tháng 09 và tạo bộ fixture tương đương trong tháng 08 đã đóng để kiểm tra publish. Không sửa đồng hồ hệ thống hoặc bỏ điều kiện để chạy test.
- Với END_OF_COURSE, tạo một enrollment/gói thử riêng đã kết thúc trước ngày chạy; dùng cơ chế kết thúc hiện có, không đóng lớp/gói thật. Tiến độ grade có thể chưa hoàn tất, và báo cáo phải phản ánh đúng điều đó.
- Các ca EXCUSED, pause inclusive, future start, missing/unassigned teacher và Grade completion dùng bản sao fixture độc lập, không làm thay đổi bộ điểm danh S1 dùng đối soát báo cáo.
- Expected 83,33% chỉ áp dụng khi định nghĩa tỷ lệ là (PRESENT+LATE)/6 buổi eligible. Nếu policy hiện tại định nghĩa khác, nêu rõ công thức và expected; không đổi policy chỉ để đạt con số này.

## 1. Academic: dữ liệu và bằng chứng học tập

- Grade chỉ hoàn tất khi đạt đủ các Subject/Component bắt buộc theo policy thật.
- Lesson khung 10/50 bài không tự trở thành số buổi học, điểm số hoặc bằng chứng hoàn thành.
- Ghi nhận một phần tiến độ, kiểm tra tổng hợp Component→Subject→Grade, lịch bắt đầu tương lai, bảo lưu và phân quyền đúng quan hệ.
- Kiểm tra hoàn tất grade bằng fixture độc lập; giữ S1 ở trạng thái chưa đạt đủ để thử báo cáo trung thực.
- Báo cáo cuối khóa không được tự đổi Grade thành COMPLETED; đóng gói học phí và vượt qua trình độ là hai sự kiện riêng.
- Nếu placeholder curriculum chưa sẵn sàng chấm, dùng assessment hợp lệ trong fixture hoặc ghi BLOCKED phần chấm; không bịa chuẩn đạt hoặc bật required flags để tạo kết quả giả.

## 2. Nhật ký học tập: giữ đúng quy tắc đã chốt

- DRAFT → SUBMITTED; chỉ submit khi session COMPLETED; không thêm bước approval.
- PRESENT/LATE bắt buộc observation và progress_note; optional: strengths, areas_to_improve, homework.
- ABSENT/EXCUSED không ép nhận xét như học viên có mặt.
- Actual teacher và SUPER_ADMIN được tạo/sửa theo policy. BRANCH_ADMIN đọc và giải quyết attention theo quyền đã chốt, không trở thành người sửa nhật ký.
- submitted_at/by chỉ ghi lần nộp đầu. Sửa sau nộp giữ SUBMITTED, cập nhật revised_at/by và revision_count.
- attention_required/resolved chỉ nội bộ; resolve không sửa journal status/revision stamps.
- Không tự tạo thêm tin Zalo cho từng lần autosave/revise nhật ký. Scope yêu cầu tin tự động ở báo cáo và phản hồi.
- Nguồn nhật ký dùng cho báo cáo phải lọc trường công khai; Student/Parent không đọc attention, internal note hoặc dữ liệu khác nhờ API serialization quá rộng.
- Queue thiếu nhật ký chỉ tính buổi thực sự cần nhật ký theo rule đã chốt; không đưa CANCELLED hoặc enrollment chưa bắt đầu/đã kết thúc/bảo lưu vào queue sai.

## 3. Báo cáo: duyệt, phát hành, trả lời, xử lý

Audit trạng thái canonical hiện tại. Về nghiệp vụ: soạn → gửi duyệt → được duyệt → khả dụng cho Student/Parent.
Nếu schema có PUBLISHED, notification trigger là bước publish thật; nếu APPROVED đồng thời là bước phát hành đã chốt, chỉ dùng một event tương đương. Không thêm hai event cùng gửi cho một lần phát hành.

Nội dung tối thiểu:
Student Overview; Learning Progress; Assessment; Attendance; Teacher Evaluation; Development Plan; Academic Status.
Nguồn là dữ liệu thuộc đúng student/enrollment và kỳ báo cáo, không tổng hợp xuyên chi nhánh hay nhầm khóa.

Điều kiện phát hành:
- Đúng creator/reviewer permissions hiện hữu; kiểm tra chính sách self-approval thay vì mặc định Teacher tự duyệt.
- Student/Parent chỉ xem phiên bản đã cho phép phát hành.
- Snapshot báo cáo được cố định và có version.
- PDF đã sẵn sàng hoặc endpoint đã chắc chắn có khả năng tạo đúng snapshot trước khi enqueue thông báo có nút tải.
- Nếu tạo PDF thất bại, không gửi thông báo “đã có báo cáo để tải”; UI thể hiện lỗi/retry riêng.
- Journal/attendance/progress thay đổi sau đó không tự viết lại bản PDF đã phát hành.
- Correction có version/audit, thu hồi hoặc thay thế bản cũ theo policy thật; không ghi đè âm thầm.

Trả lời và xử lý:
- Parent/Student gửi câu hỏi gắn report_id, report_version, student_id và actor.
- Nhân sự đúng quyền trả lời công khai hoặc ghi chú nội bộ; hai loại phải được tách rõ trong UI/API/notification.
- Teacher chỉ thao tác học sinh thuộc phạm vi quan hệ; quản trị xử lý theo role/branch hiện có.
- Nếu chưa có workflow xử lý trao đổi: đề xuất OPEN → IN_PROGRESS → RESOLVED cho thread riêng, không dùng làm report approval status. Parent gửi thêm sau RESOLVED thì mở lại thread và giữ lịch sử.
- Phải ghi người phụ trách, người trả lời, thời điểm, kết quả xử lý. Autosave và internal note không phát tin ra ngoài.
- Nội dung trả lời do nhân sự nhập. “Tự động” trong nhiệm vụ là tự động gửi thông báo theo sự kiện, không tự bịa lời giải thích học thuật hoặc tự đóng khiếu nại bằng AI.

## 4. Phản hồi buổi học: nhận, phân công, trả lời và giải quyết

- Parent/Student chỉ gửi cho đúng học sinh/buổi học đủ điều kiện và đã COMPLETED.
- Rating 1–5, comment và nguồn tác giả được giữ nguyên; nhân sự không sửa lời phản hồi gốc.
- Theo rule hiện có, rating ≤2 vào queue cần xử lý; kiểm tra actual implementation trước khi sửa.
- Phân công xử lý, public reply, internal note, resolution được phân quyền và ghi audit.
- Nếu thiếu workflow xử lý, dùng thread/ticket riêng OPEN→IN_PROGRESS→RESOLVED phù hợp mô hình hiện hữu, không sao chép workflow approval của Learning Report hoặc Nhật ký.
- Parent có thể đọc câu trả lời và gửi bổ sung theo quyền; reopen không làm mất lịch sử.
- Khi reply và resolve diễn ra trong cùng một transaction, tạo một notification cập nhật có nghĩa; tránh hai tin nội dung gần như giống nhau.
- Nếu nghiệp vụ tách reply rồi resolve ở hai thời điểm, quản lý hai event version rõ ràng; không dedupe nhầm mà làm mất lần cập nhật thật.
- Lời mời đánh giá chỉ gửi một lần theo student/session/recipient/purpose; không nhân tin do journal revise.
- Trường hợp ABSENT/EXCUSED: theo policy đủ điều kiện phản hồi hiện có, không tự mời đánh giá “đã tham gia buổi học” nếu không có mặt.
- Xác nhận đã tiếp nhận có thể hiện trong portal; không tự thêm hàng loạt Zalo acknowledgement ngoài budget/phạm vi.

## 5. Thiết kế notification tự động dùng Zalo

Các tên event/config dưới đây là logical keys đề xuất, không phải API endpoint hoặc template_id thật.

| Logical event | Điều kiện tạo | Nội dung thông báo | CTA |
|---|---|---|---|
| LEARNING_REPORT_AVAILABLE | Báo cáo được phép phát hành, snapshot/PDF sẵn sàng | Có báo cáo học tập mới | Tải báo cáo PDF |
| LEARNING_REPORT_THREAD_UPDATED | Có public reply hoặc public resolution mới | Yêu cầu về báo cáo đã được cập nhật | Xem trả lời |
| LESSON_FEEDBACK_REQUESTED | Buổi COMPLETED, học viên/recipient đủ điều kiện | Mời phản hồi về buổi học cụ thể | Gửi phản hồi |
| LESSON_FEEDBACK_UPDATED | Public reply/public resolution mới | Phản hồi học tập đã được cập nhật | Xem phản hồi |

- Tái sử dụng notification service, durable outbox, token vault MAIN và scheduler đã có. Không dựng kho token thứ hai.
- Đưa outbox event vào cùng transaction với thay đổi nghiệp vụ, hoặc dùng cơ chế bền vững tương đương; không chỉ fire-and-forget sau response.
- Unique logical key gồm event kind + entity ID + event/version/reply ID + recipient identity + purpose.
- Worker claim/lease có cơ chế chống chạy song song; retry hữu hạn. Không cam kết exactly-once ở Zalo nếu provider không hỗ trợ.
- tracking_id để đối soát; không mặc định provider dedupe theo tracking_id.
- Mọi retry kiểm tra lại business validity, quyền nhận, consent, trạng thái template, thời hạn và quota.
- API timeout sau khi gửi: trạng thái UNKNOWN và đối soát; không tự resend chỉ vì chưa có delivery webhook.
- Delivered/Read chỉ cập nhật theo bằng chứng provider tương ứng; không suy ra Read từ Accepted.
- Callback phải xác thực theo tài liệu đúng kênh UID/SĐT hiện sử dụng; replay, duplicate, out-of-order không gây thay đổi sai.
- Recipient mapping theo OA/App/channel, không dùng tùy tiện UID của OA khác.
- Không đổi consent hoặc mở allowlist chỉ để test vượt qua.
- Không làm lộ access/refresh token; dùng refresh/rotation locking hiện có; chỉ re-authorize nếu xác định cần thiết.
- Thông báo lỗi queue không chặn việc Parent đọc báo cáo trong portal hoặc nhân sự lưu trả lời thành công.
- Không chuyển tiếp nguyên internal note, rating nhạy cảm hoặc nội dung khiếu nại ra lockscreen Zalo.

## 6. Nội dung bốn mẫu Zalo đề xuất

Đây là bản nội dung để khai báo/kiểm duyệt, CHƯA được Zalo phê duyệt. Không tái sử dụng template đăng ký thành công cho sự kiện học tập nếu metadata/purpose không phù hợp. Placeholder <...> phải được ánh xạ đúng thông số của template thật.

Mẫu A — Báo cáo học tập:
- Tiêu đề: BÁO CÁO HỌC TẬP VIBE
- Nội dung: “Kính gửi <recipient_name>, Vibe Academy đã phát hành báo cáo học tập cho học viên <student_name>, mã học viên <student_code>. Loại báo cáo: <report_type>. Kỳ báo cáo: <report_period>. Vui lòng chọn nút bên dưới để xem và tải báo cáo.”
- CTA chính: “Tải báo cáo PDF”.
- CTA phụ, nếu template được duyệt hỗ trợ và cần dùng: “Xem báo cáo”.
- Dữ liệu mẫu: TEST Phụ huynh Minh An; TEST Minh An; mã học viên fixture; Báo cáo tháng; Tháng 08/2026 cho ca phát hành đã đóng kỳ.

Mẫu B — Cập nhật trao đổi về báo cáo:
- Tiêu đề: CẬP NHẬT TRAO ĐỔI HỌC TẬP
- Nội dung: “Kính gửi <recipient_name>, Vibe Academy đã cập nhật yêu cầu số <request_code> về báo cáo học tập của học viên <student_name>, mã học viên <student_code>. Trạng thái: <request_status>. Vui lòng xem nội dung trả lời trong hệ thống.”
- CTA: “Xem trả lời”.
- Chỉ dùng status đã thật sự xảy ra; không đưa toàn bộ câu trả lời tự do vào một biến để né quy định template.

Mẫu C — Mời phản hồi buổi học:
- Tiêu đề: PHẢN HỒI BUỔI HỌC VIBE
- Nội dung: “Kính gửi <recipient_name>, buổi học <subject_name> ngày <session_date> của học viên <student_name>, mã học viên <student_code>, đã hoàn tất. Vibe Academy mời quý phụ huynh chia sẻ phản hồi về buổi học để nhà trường cải thiện chất lượng giảng dạy.”
- CTA: “Gửi phản hồi”.
- Mẫu này dành cho Parent; nếu gửi trực tiếp Student, dùng biến thể cách xưng hô phù hợp đã được duyệt, không gửi “quý phụ huynh” cho học sinh.

Mẫu D — Cập nhật xử lý phản hồi:
- Tiêu đề: CẬP NHẬT PHẢN HỒI HỌC TẬP
- Nội dung: “Kính gửi <recipient_name>, Vibe Academy đã cập nhật phản hồi số <feedback_code> liên quan đến buổi học ngày <session_date> của học viên <student_name>, mã học viên <student_code>. Trạng thái: <feedback_status>. Vui lòng xem nội dung trả lời và kết quả xử lý trong hệ thống.”
- CTA: “Xem phản hồi”.

Phân loại nội dung đề xuất:
- Báo cáo tình hình học tập và khảo sát về dịch vụ đã sử dụng nằm trong các trường hợp chăm sóc khách hàng được tài liệu Zalo mô tả.
- Đây không phải bằng chứng template của VIBE được duyệt. Kiểm tra mục đích/tag hiện hành và kết quả duyệt riêng từng mẫu.
- URL nằm trong CTA, không chèn trong body. Không dùng link rút gọn. Nội dung và tham số phải vượt validation metadata thật trước khi gọi API.
- Các CTA dùng tham số URL cần theo chuẩn template đã duyệt, tên tham số tách biệt với body khi quy định yêu cầu; encode đúng một lần, tránh double-encoding.
- Nộp mẫu bằng đúng OA/App hiện có nếu môi trường và quyền đã cho phép; nếu chưa có quyền truy cập, bàn giao nội dung và trạng thái PENDING_PROVIDER_APPROVAL. Không tự nhận là đã gửi duyệt.

## 7. Nút Download/PDF và đường dẫn

Mẫu đường dẫn thiết kế:
PUBLIC_APP_URL + một route báo cáo/PDF thật trong ứng dụng.
PUBLIC_APP_URL phải lấy từ môi trường đã xác minh; không mặc định manage.vibe.edu.vn đang hoạt động.

- Điện thoại của Parent không truy cập localhost:3000 trên máy Mac của Owner. Test nội bộ local và test CTA thật là hai chặng.
- CTA trỏ đến route ổn định của VIBE. Parent đăng nhập nếu cần, sau đó hệ thống kiểm tra relationship/branch/report visibility hiện tại trước khi trả PDF.
- Không dùng mã student/report UUID như một cơ chế authorization.
- Tài liệu để trong private storage. Nếu cần signed storage URL, tạo TTL ngắn sau authorization tại thời điểm click; không nhúng URL ký ngắn hạn vào tin có thể được mở vài ngày sau.
- Nếu dùng token chuyển hướng, token không tự thay thế quyền Parent↔Child; tránh one-time token bị Zalo link preview/prefetch tiêu thụ.
- GET/HEAD không submit phản hồi, resolve thread hay thay đổi trạng thái nghiệp vụ.
- Thu hồi quan hệ Parent↔Child hoặc quyền xem phải có hiệu lực khi mở lại link cũ.
- Không có tên học sinh, SĐT, access token hoặc JWT trong URL.
- Cache PDF private/no-store theo kiến trúc; không dùng CDN public cho tài liệu cá nhân.
- Tham số tracking Zalo có thể được thêm vào URL; route phải dung nạp các query vô hại mà không tạo open redirect hoặc làm hỏng kiểm tra quyền.
- Test tiếng Việt, page breaks, bảng dài, phiên bản snapshot, Content-Type, Content-Disposition và filename an toàn.
- Zalo in-app browser có thể mở PDF thay vì tự lưu. Chấp nhận nút mở PDF kèm thao tác tải/lưu rõ ràng, nhưng phải kiểm chứng thật trên thiết bị; không ghi “download PASS” chỉ vì request trả 200.

## 8. Gửi thử thật có giới hạn

Chỉ gửi tới tài khoản/số thử đã được Owner chỉ định, có consent và allowlist cho đúng mục đích. Không mặc định recipient của đăng ký thành công cũng được phép nhận các tin khác.

- Đọc giới hạn gửi/counter hiện tại, không reset. Kế hoạch đề xuất tối đa 5 tin nếu budget hiện có cho phép: monthly report, end-of-course report, report reply/update, invitation to feedback, feedback reply+resolution.
- Nếu còn ít budget hơn, ưu tiên báo cáo+download và feedback update; đánh dấu ca còn lại NOT_RUN/BLOCKED, không tăng quota.
- Khi cần tách reply và resolve thành hai event thật, kiểm thử đầy đủ với mock trước và chỉ chọn một nhánh live trong budget.
- Chưa đủ template approved, recipient, consent hoặc HTTPS URL: BLOCKED_EXTERNAL cho chặng live, tiếp tục toàn bộ local/mocked tests.
- Không retry gửi live bằng cách refresh trang hoặc bấm nút nhiều lần để “xem có đến không”.
- Nếu bước cuối còn thiếu số/UID thử, chỉ yêu cầu Owner cung cấp sau khi nội dung mẫu, payload preview và giới hạn gửi cụ thể đã sẵn sàng.

## 9. Ma trận kiểm thử (59 ca — chưa chạy)

### Môi trường

| ID | Ca kiểm thử | Kết quả cần đạt | Trạng thái |
|---|---|---|---|
| ENV-01 | Repo/runtime | Xác minh CWD, branch, local changes và DB thật của localhost:3000; app và script cùng DB. | NOT_RUN |
| ENV-02 | Dữ liệu nền | Bốn chương trình/các level cần cho fixture tồn tại; chưa có thì áp dụng đặc tả curriculum đã chốt trước, không giả định đã seed. | NOT_RUN |
| ENV-03 | Cô lập gửi tin | Fixture chỉ gửi qua mock/dry-run; integration thật chỉ dùng recipient test đã được định danh, consent và allowlist phù hợp. | NOT_RUN |

### Hồ sơ và quan hệ

| ID | Ca kiểm thử | Kết quả cần đạt | Trạng thái |
|---|---|---|---|
| PROFILE-01 | Tạo hồ sơ | Tạo S1 qua luồng nghiệp vụ, có student code, branch, trạng thái và audit actor; reload còn đúng dữ liệu. | NOT_RUN |
| PROFILE-02 | Liên kết phụ huynh | P1 chỉ thấy S1/S2; chọn từng con giữ đúng report, session, feedback context. | NOT_RUN |
| PROFILE-03 | Rerun | Chạy lại fixture cùng run_id không nhân bản user/student/parent/class/enrollment/session. | NOT_RUN |
| PROFILE-04 | Cô lập chi nhánh | S4 thuộc branch B; tài khoản Branch Admin A không đọc/ghi được dữ liệu của S4 qua UI hoặc API. | NOT_RUN |

### Academic

| ID | Ca kiểm thử | Kết quả cần đạt | Trạng thái |
|---|---|---|---|
| ACA-01 | Gán chương trình | S1 gán Piano Grade 1, đúng curriculum/level/enrollment; hiển thị đúng trên hồ sơ và portal. | NOT_RUN |
| ACA-02 | Level đặc biệt | S2 dùng Piano Pre Step; S3 Drums Pre không có Pre Step trong bộ khung mới. | NOT_RUN |
| ACA-03 | Grade nâng cao | S4 Guitar Grade 4 có Ensemble; S5 Violin Grade 7 có Ensemble/Music History/Media Product. | NOT_RUN |
| ACA-04 | Tiến độ thực | Cập nhật một yêu cầu hợp lệ theo policy; Component→Subject→Grade nhất quán; chưa đủ required thì chưa hoàn tất grade. | NOT_RUN |
| ACA-05 | Đủ điều kiện hoàn tất | Trong fixture riêng, đạt đủ yêu cầu thực sự mới hoàn tất grade; không dùng việc tick 10 placeholder làm bằng chứng học thuật. | NOT_RUN |
| ACA-06 | Lịch tương lai/bảo lưu | Ngày bắt đầu tương lai và pause inclusive chặn thao tác theo rule; không tạo nghĩa vụ nhật ký giả cho buổi không thuộc enrollment hiệu lực. | NOT_RUN |
| ACA-07 | Khóa học và trình độ | Kết thúc gói/khóa học không tự đồng nghĩa PASS grade; học viên ít tiến độ vẫn có báo cáo cuối khóa hợp lệ với trạng thái thực. | NOT_RUN |

### Nhật ký học tập

| ID | Ca kiểm thử | Kết quả cần đạt | Trạng thái |
|---|---|---|---|
| JNL-01 | Điều kiện nộp | Session chưa COMPLETED không submit được; DRAFT nếu được hệ thống cho phép vẫn không làm lộ dữ liệu hay tạo event phát hành. | NOT_RUN |
| JNL-02 | PRESENT/LATE | Thiếu observation hoặc progress_note bị chặn; đủ hai trường thì submit được; strengths/areas_to_improve/homework là tùy chọn. | NOT_RUN |
| JNL-03 | ABSENT/EXCUSED | Không ép các trường nhận xét bắt buộc như PRESENT/LATE; các trạng thái đúng attendance policy. | NOT_RUN |
| JNL-04 | Người dạy thực tế | Actual teacher và SUPER_ADMIN tạo/sửa theo policy; giáo viên khác hoặc PRIMARY không phải actual teacher không ghi nhật ký thay. | NOT_RUN |
| JNL-05 | Lần nộp đầu | DRAFT→SUBMITTED; ghi submitted_at/by lần đầu; không có bước duyệt nhật ký. | NOT_RUN |
| JNL-06 | Sửa sau nộp | Giữ SUBMITTED và submitted_at/by; cập nhật revised_at/by, revision_count chính xác một lần cho một revision thực. | NOT_RUN |
| JNL-07 | Attention | Giáo viên flag, admin đúng quyền resolve; resolution không thay revision/submitted stamps hay journal status; Student/Parent không thấy trường nội bộ. | NOT_RUN |
| JNL-08 | Queue thiếu nhật ký | COMPLETED không journal xuất hiện; CANCELLED/paused/not-started/ended được loại đúng rule; chưa gán teacher khác với thiếu row view. | NOT_RUN |
| JNL-09 | Nguồn báo cáo | Journal đã nộp được dùng theo phạm vi báo cáo; trường nội bộ không lọt qua API/PDF; journal revised không tự thay snapshot báo cáo đã phát hành. | NOT_RUN |

### Báo cáo và trao đổi

| ID | Ca kiểm thử | Kết quả cần đạt | Trạng thái |
|---|---|---|---|
| REP-01 | MONTHLY | Tạo báo cáo tháng từ Academic/Attendance/Journal/Assessment đúng học sinh, khoảng ngày và Asia/Ho_Chi_Minh. | NOT_RUN |
| REP-02 | Mẫu số điểm danh | Fixture sáu buổi COMPLETED: PRESENT 4, LATE 1, ABSENT 1; hiển thị đủ breakdown, không tính buổi CANCELLED/future. Nếu tỷ lệ có mặt=(PRESENT+LATE)/eligible thì 5/6=83,33%. | NOT_RUN |
| REP-03 | END_OF_COURSE | Fixture khóa đã kết thúc tạo báo cáo tổng kết cả kỳ; phân biệt kết quả cuối khóa với tiến độ grade còn chưa đạt. | NOT_RUN |
| REP-04 | Duyệt và trả chỉnh sửa | Creator/reviewer đúng policy hiện có; draft/review chưa cho portal xem và chưa gửi Zalo; bị trả chỉnh sửa không phát hành. | NOT_RUN |
| REP-05 | Phát hành | Sau điều kiện duyệt/phát hành canonical mới tạo snapshot/version bất biến, PDF sẵn sàng và event báo cáo một lần. | NOT_RUN |
| REP-06 | PDF | Đúng dấu tiếng Việt, số liệu, kỳ, tên học sinh, footer; không tràn bảng; file thật application/pdf, đúng snapshot/version. | NOT_RUN |
| REP-07 | Quyền trước phát hành | Student/Parent không đọc/tải DRAFT/REVIEW qua URL trực tiếp, API, storage path hay guessed ID. | NOT_RUN |
| REP-08 | Gửi câu hỏi | Parent gửi câu hỏi gắn đúng report/version/student; không sửa nội dung báo cáo; nội bộ thấy queue và audit. | NOT_RUN |
| REP-09 | Trả lời/xử lý | Nhân sự đúng quyền gửi trả lời công khai, phân biệt ghi chú nội bộ; xử lý yêu cầu không đổi academic/report approval status. | NOT_RUN |
| REP-10 | Sửa phiên bản | Sửa báo cáo đã phát hành phải theo cơ chế correction/version; bản cũ không bị ghi đè âm thầm; tin nhắn trỏ đúng version. | NOT_RUN |
| REP-11 | Tải trên điện thoại | Mở CTA trong Zalo, xử lý đăng nhập rồi quay lại đúng report; tải hoặc mở PDF với lựa chọn lưu; không tuyên bố tự lưu vào máy khi chưa kiểm chứng. | NOT_RUN |

### Phản hồi học tập

| ID | Ca kiểm thử | Kết quả cần đạt | Trạng thái |
|---|---|---|---|
| FDB-01 | Mời phản hồi | Buổi COMPLETED và học viên đủ điều kiện nhận lời mời đúng một lần; không mời cho buổi CANCELLED/future. | NOT_RUN |
| FDB-02 | Gửi phản hồi | Student/Parent hợp lệ gửi rating 1–5 và comment gắn đúng session/student; validate ở server. | NOT_RUN |
| FDB-03 | Phản hồi thấp | Rating 2/5 vào queue cần xử lý theo policy; chưa trả lời hoặc chưa xử lý không được hiển thị đã giải quyết. | NOT_RUN |
| FDB-04 | Trả lời công khai | Nhân sự đúng quyền trả lời, Parent thấy đúng nội dung; internal note không gửi Zalo hoặc lộ trong portal. | NOT_RUN |
| FDB-05 | Phân công và xử lý | Assignee, processing state, resolution note, timestamps/actors được ghi; Resolve không tự sửa rating/comment gốc. | NOT_RUN |
| FDB-06 | Phản hồi thêm | Parent phản hồi tiếp sau xử lý được giữ lịch sử và mở lại xử lý theo workflow canonical, không tạo vòng lặp tin nhắn. | NOT_RUN |
| FDB-07 | Một học sinh/nhiều tác giả | Kiểm tra rule dedupe Student/Parent hiện có; không tự gộp hai tác giả hoặc ghi đè ý kiến của nhau. | NOT_RUN |
| FDB-08 | Thông báo cập nhật | Public reply/resolution tạo đúng thông báo cho tác giả/người nhận hợp lệ; autosave/internal note/assignee change không gửi tin công khai. | NOT_RUN |

### Zalo và hàng đợi

| ID | Ca kiểm thử | Kết quả cần đạt | Trạng thái |
|---|---|---|---|
| ZALO-01 | Template | Đọc template metadata từ OA/App thật: ID, purpose, status, params, CTA, kênh UID/SĐT đúng; thiếu template là BLOCKED riêng. | NOT_RUN |
| ZALO-02 | Recipient | Dùng UID/SĐT đã xác minh, consent và allowlist đúng run; thiếu một điều kiện thì không gọi API gửi; không giả UID từ student ID/phone. | NOT_RUN |
| ZALO-03 | Payload | Mỗi event render đúng template/params/URL allowlisted; validate độ dài/định dạng theo metadata thật; không có PII nhạy cảm hay nội bộ trong biến. | NOT_RUN |
| ZALO-04 | Outbox atomic | Business transaction rollback thì không có event gửi; commit tạo event bền vững; khởi động lại worker không mất event. | NOT_RUN |
| ZALO-05 | Dedupe/concurrency | Double click, retry và hai worker không tạo hai send cho cùng event/version/recipient/purpose; tracking_id không được coi mặc nhiên là provider idempotency. | NOT_RUN |
| ZALO-06 | Lỗi tạm thời | 429/5xx được phân loại retry hữu hạn với backoff; timeout sau gửi là UNKNOWN cần đối soát, không gửi lại mù. | NOT_RUN |
| ZALO-07 | Token | Dùng kho token MAIN hiện có; token rotation có khóa và lưu cặp mới đúng; auth cần cấp lại thì chặn queue và báo, không retry vô hạn. | NOT_RUN |
| ZALO-08 | Delivery receipt | Accepted có msg_id chưa phải delivered/read; webhook xác thực, xử lý trùng/đến sai thứ tự và không cập nhật nhầm message. | NOT_RUN |
| ZALO-09 | CTA an toàn | HTTPS public hợp lệ; không localhost/private IP/shortener; tham số CTA hợp lệ, UTM của Zalo không phá route; không lộ storage URL dài hạn. | NOT_RUN |
| ZALO-10 | Chống vòng lặp | Webhook receipt/click/read/internal status update không tạo outbound event mới; replay không nhân tin hoặc phản hồi. | NOT_RUN |
| ZALO-11 | Gửi thật có bằng chứng | Chỉ trong budget/recipient test đã cho phép: lưu msg_id, receipt nếu có, xác nhận trên điện thoại và tải PDF. Không có bằng chứng thì không PASS LIVE. | NOT_RUN |

### Quyền và hồi quy

| ID | Ca kiểm thử | Kết quả cần đạt | Trạng thái |
|---|---|---|---|
| SEC-01 | Truy cập chéo | Đổi student/report/feedback UUID hoặc download token không đọc được hồ sơ học sinh khác; cả UI/API/PDF đều kiểm tra relationship/branch. | NOT_RUN |
| SEC-02 | Thu hồi quyền | Gỡ Parent↔Child hoặc revoke report thì portal/download từ link cũ bị từ chối; link không là quyền truy cập vĩnh viễn. | NOT_RUN |
| SEC-03 | Bảo mật cache/log | Cache không trả PDF người khác; log không có token, mật khẩu, URL ký còn hiệu lực hay nội dung khiếu nại nhạy cảm. | NOT_RUN |
| SEC-04 | XSS và CSRF | Nội dung nhận xét được render an toàn; các hành động reply/resolve/download authorization theo pattern hiện có; GET/prefetch không resolve, submit hoặc tiêu thụ one-time token. | NOT_RUN |
| SEC-05 | Module liên quan | Không làm đổi nhật ký/điểm/học phí/hóa đơn/chi trả thật; notifications đăng ký và kho token MAIN giữ hoạt động đúng. | NOT_RUN |
| SEC-06 | Lưu vết và cleanup | Giữ hồ sơ E2E đã gắn run_id để Owner kiểm tra; cleanup chỉ đúng fixture và dữ liệu phụ thuộc, không xóa audit hoặc dữ liệu người dùng thật. | NOT_RUN |


## 10. Bằng chứng bắt buộc và tiêu chí kết luận

Cho mỗi case, ghi:
test_id; run_id; actor role; entity IDs; route/action; dữ liệu đầu vào; expected; actual; timestamp UTC+7; PASS/FAIL/BLOCKED/NOT_RUN; bằng chứng; lý do blocker.

Các tầng kết quả phải tách riêng:
1. LOCAL_FLOW: tạo hồ sơ, Academic, journal, reports, feedback/replies và permissions.
2. MOCK_ZALO: đúng trigger/payload/dedupe/retry, không gửi ra ngoài.
3. LIVE_ACCEPTED: provider trả accepted và msg_id hợp lệ.
4. LIVE_DELIVERED: bằng chứng delivery hoặc người nhận xác nhận đúng tin; nguồn bằng chứng phải nêu rõ.
5. LIVE_DOWNLOAD: CTA trên điện thoại mở đúng bản PDF sau authorization và tải/lưu được.

Chỉ kết luận end-to-end hoàn tất khi các chặng cần thiết đã có bằng chứng thực. Có mã API 0, queue SENT hoặc một ảnh UI không đủ để kết luận người nhận đã nhận/tải đúng báo cáo.

Deliverables trong repo:
- Fixture script/manifest và ref→ID mapping.
- Các thay đổi cần thiết cho reply/resolve, PDF và notification integration.
- Tests tự động phù hợp với test stack đang có; không tạo framework mới nếu không cần.
- Kết quả 59 ca có actual evidence, ảnh giao diện và PDF mẫu kiểm chứng.
- Template registry: logical key→template_id thật, approval state, params, CTA pattern, channel.
- Bug list: lỗi, nguyên nhân, sửa gì, retest, còn thiếu gì.
- Cleanup có mục tiêu, chưa chạy mặc định.
- Báo cáo ngắn cho Owner: URL hồ sơ S1, report/monthly/end-course, feedback thread, số tin thật đã gửi, các chặng PASS và blocker còn lại.

Không trình bày file kế hoạch này như một kết quả test đã chạy.

## Nguồn Zalo đã đối chiếu khi soạn

Tài liệu chính thức, tra cứu ngày 28/09/2026:
1. ZBS Template Message, mẫu phải đăng ký/kiểm duyệt trước khi gửi:
https://oa.zalo.me/home/documents/vie/guides/zbs-template-message
2. Quy định mẫu ZBS, nội dung chăm sóc học tập/khảo sát và yêu cầu CTA:
https://zalo.solutions/news/quy-dinh-chung-khi-kiem-duyet-mau-tin-nhan-zbs/xdygqtrjjm97k28rsh07wr72
3. CTA truy cập đường dẫn và các tham số tracking có thể được thêm:
https://zalo.solutions/blog/huong-dan-them-nut-thao-tac-cta-trong-mau-zns/a7x4qv3exty0yrgztcrxinbo
4. Tham số URL trong CTA:
https://zalo.solutions/blog/cap-nhat-tinh-nang-zns-cho-phep-truyen-tham-so-param-vao-nut-thao-tac-cta-/w0unrzg8f47exp61k8a26j2m
5. Response API và delivery webhook là các mốc khác nhau:
https://zalo.solutions/business-message/guidelines/gui-api

Lưu ý nguồn: các hướng dẫn CTA mang tên ZNS là hướng dẫn chính thức đang được liên kết trong hệ sinh thái ZBS; khi thực thi phải ưu tiên metadata/API documentation của đúng kênh gửi UID hoặc SĐT đang dùng. Không suy ra payload mới từ API ZNS cũ.
