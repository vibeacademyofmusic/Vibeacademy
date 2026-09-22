# Business CRM pilot script V1

Local super-admin only. Do not create production users. The admin shell still rejects every other role.

1. Open `/admin/business`. Confirm the queues link to a filtered list.
2. Open `/admin/business/crm`. Create a lead with a name and phone. Confirm it appears as Mới.
3. Open the lead. Assign an owner, add a note, and set a follow-up date.
4. Move the lead through Đã liên hệ, Đủ điều kiện, Đã hẹn học thử, Đã học thử, Đã gửi đề xuất, Đang thương lượng, then Chốt thành công or Chốt thất bại. A loss requires a note.
5. On a won lead, record a conversion review. Linking requires an existing student. The screen must not create a student.
6. Open `/admin/business/campaigns`. Create a campaign without a budget. Confirm the budget reads “Chưa có dữ liệu chi phí”. Attach that campaign on the lead.
7. Open `/admin/business/reports` for the current month. Confirm the cohort and the activity sections are both present.
8. Open `/admin/business/reactivation` and run Làm mới danh sách. A future pause must not appear. An ended pause with no active enrollment may appear.
9. Open `/admin/business/instrument-customers` after a real instrument sale. Attach a contact, open a warranty case, and add a follow-up. Confirm the serial matches the unit and no tuition invoice was created.
10. Return to `/admin/business` and confirm the related counters changed.

Stop if a page asks for a service-role key or writes to a remote database.
