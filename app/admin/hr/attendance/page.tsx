import Link from 'next/link'

import {
  adminClient,
  pageNumber,
  type Params,
} from '../../finance/operations'

import {
  attendanceData,
  monthRange,
} from '../../employees/attendance/data'

import {
  AppPage,
  PageHeader,
  FilterBar,
  FormField,
  InlineNotice,
  MetricCard,
  SectionCard,
  DataTable,
} from '../../_components/vibe'

import Matrix, {
  type Person,
} from './Matrix'

import {
  attendanceIssues,
  todayMetrics,
} from './model'

import QrAttendanceShell
  from './QrAttendanceShell'

export default async function MonthlyAttendance({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const p = await searchParams
  const db = await adminClient()
  const range = monthRange(p.month)
  const page = pageNumber(p.page)

  let query = db
    .from('employee_directory')
    .select(
      'id,employee_code,full_name',
      {
        count: 'exact',
      },
    )
    .order('employee_code')
    .range(
      (page - 1) * 15,
      page * 15 - 1,
    )

  if (p.q) {
    query = query.ilike(
      'full_name',
      '%'
      + p.q.replace(
        /[%_]/g,
        '',
      )
      + '%',
    )
  }

  const result = await query

  const people: Person[] =
    await Promise.all(
      (result.data || []).map(
        async (employee) => {
          try {
            const data =
              await attendanceData(
                db,
                {
                  employee:
                    employee.id,
                  month:
                    range.month,
                },
              )

            return {
              id: employee.id,
              name:
                employee.full_name
                || employee.employee_code,
              code:
                employee.employee_code,
              unavailable: false,
              schedule:
                data.schedule,
              entries:
                data.entries,
              requests:
                data.requests,
              reviewed:
                data.reviews.map(
                  (
                    review: {
                      request_id: string
                    },
                  ) =>
                    review.request_id,
                ),
              history:
                data.history,
            }
          } catch {
            return {
              id: employee.id,
              name:
                employee.full_name
                || employee.employee_code,
              code:
                employee.employee_code,
              unavailable: true,
              schedule: [],
              entries: [],
              requests: [],
              reviewed: [],
              history: [],
            }
          }
        },
      ),
    )

  const today =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      },
    ).format(new Date())

  const days = Array.from(
    {
      length:
        Number(
          range.to.slice(-2),
        ),
    },
    (_, i) =>
      range.month
      + '-'
      + String(i + 1)
        .padStart(2, '0'),
  )

  const metrics = result.error
    ? {
        scheduled: null,
        checkedIn: null,
        completed: null,
        missing: null,
        lateEarly: null,
      }
    : todayMetrics(people, today)

  const issues =
    result.error
    || (
      people.length > 0
      && people.every(
        (person) => person.unavailable,
      )
    )
      ? null
      : attendanceIssues(
          people,
          today,
          days,
        )

  return (
    <AppPage>
      <PageHeader
        title="Chấm công"
        description="QR theo chi nhánh, bằng chứng vào/ra ca, bảng công tháng và các ngoại lệ cần xử lý."
      />

      <section>
        <h2>Tổng quan hôm nay</h2>
        <div className="vibe-grid">
          {(
            [
              [
                'Nhân viên có lịch hôm nay',
                metrics.scheduled,
              ],
              [
                'Đã vào ca',
                metrics.checkedIn,
              ],
              [
                'Đã hoàn tất chấm công',
                metrics.completed,
              ],
              [
                'Thiếu chấm công',
                metrics.missing,
              ],
              [
                'Đi muộn / về sớm',
                metrics.lateEarly,
              ],
            ] as const
          ).map(([title, value]) => (
            <MetricCard
              key={title}
              title={title}
              value={
                value === null
                  ? '—'
                  : value
              }
              note="Theo nhân viên trên trang này"
            />
          ))}
        </div>
      </section>

      <QrAttendanceShell />

      <SectionCard title="Vấn đề cần xử lý">
        {issues === null ? (
          <p>—</p>
        ) : (
          <DataTable
            headers={[
              'Nhân viên',
              'Nội dung',
            ]}
            rows={issues.map(
              (issue) => [
                issue.name,
                issue.detail,
              ],
            )}
          />
        )}
      </SectionCard>

      <form>
        <FilterBar>
          <FormField
            label="Tháng"
            name="month"
            type="month"
            defaultValue={
              range.month
            }
          />

          <FormField
            label="Tìm nhân viên"
            name="q"
            defaultValue={p.q}
          />

          <button className="vibe-button">
            Lọc
          </button>

          <Link
            href="/admin/hr/attendance"
            className="vibe-button"
          >
            Bỏ lọc
          </Link>
        </FilterBar>
      </form>

      <h2>Bảng công tháng</h2>

      <InlineNotice>
        “Thiếu bằng chứng” cần được kiểm tra,
        không tự coi là vắng không lương.
        QR hợp lệ được xác nhận bởi hệ thống;
        các chỉnh sửa thủ công vẫn phải qua
        quy trình maker-checker.
      </InlineNotice>

      {result.error ? (
        <InlineNotice tone="error">
          Không tải được danh sách nhân viên.
        </InlineNotice>
      ) : (
        <Matrix
          people={people}
          days={days}
          today={today}
        />
      )}

      <div className="vibe-actions">
        {page > 1 && (
          <Link
            href={
              `?month=${range.month}&q=${encodeURIComponent(p.q || '')}&page=${page - 1}`
            }
          >
            Trang trước
          </Link>
        )}

        <span>
          Trang {page} · tối đa
          {' '}
          15 nhân viên / trang
        </span>

        {page * 15
          < (result.count || 0)
          && (
            <Link
              href={
                `?month=${range.month}&q=${encodeURIComponent(p.q || '')}&page=${page + 1}`
              }
            >
              Trang tiếp
            </Link>
          )}
      </div>
    </AppPage>
  )
}
