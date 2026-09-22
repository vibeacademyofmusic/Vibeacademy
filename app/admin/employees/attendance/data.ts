import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  Params,
} from '../../finance/operations'


export const attendanceStates = [
  {
    id: 'WORKED',
    name: 'Đã làm việc',
  },
  {
    id: 'SCHEDULED_OFF',
    name: 'Nghỉ theo lịch',
  },
  {
    id: 'PAID_LEAVE',
    name: 'Nghỉ phép có lương (theo hạn mức)',
  },
  {
    id: 'UNPAID_LEAVE',
    name: 'Nghỉ không lương',
  },
  {
    id: 'UNAUTHORIZED_ABSENCE',
    name: 'Vắng không phép',
  },
  {
    id: 'BUSINESS_TRIP',
    name: 'Công tác',
  },
  {
    id: 'LATE',
    name: 'Đi muộn',
  },
  {
    id: 'EARLY_LEAVE',
    name: 'Về sớm',
  },
]


export const isLeave = (
  status: string,
) =>
  status === 'PAID_LEAVE'
  || status === 'UNPAID_LEAVE'


export function monthRange(
  input?: string,
) {
  const today =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
      },
    ).format(new Date())

  const month =
    /^\d{4}-(0[1-9]|1[0-2])$/
      .test(input || '')
      ? input!
      : today

  const [year, m] =
    month
      .split('-')
      .map(Number)

  return {
    month,

    from:
      month + '-01',

    to:
      month
      + '-'
      + new Date(
        Date.UTC(
          year,
          m,
          0,
        ),
      ).getUTCDate(),
  }
}


export type Shift = {
  work_date: string
  shift_code: string
  unit_code: string
  employment_version: number
  starts_at: string
  ends_at: string
  scheduled_minutes: number
  schedule_state: string
  trip_id: string | null
}


export type AttendanceEntry = {
  id: string
  employee_id: string

  work_date: string
  shift_code: string

  revision: number
  status: string
  entry_kind: string

  schedule_snapshot:
    | Record<string, unknown>
    | null

  arrived_at: string | null
  departed_at: string | null

  late_minutes: number
  early_minutes: number

  reason: string | null

  actor: string
  checker: string | null

  created_at: string

  previous_entry_id:
    | string
    | null

  request_id:
    | string
    | null

  leave_policy_id:
    | string
    | null

  paid_leave_minutes: number
  unpaid_leave_minutes: number

  qr_verified: boolean
}


type AttendanceEntryRow =
  Omit<
    AttendanceEntry,
    'qr_verified'
  >


type QrVerification = {
  attendance_entry_id: string

  work_date: string
  shift_code: string

  verification_method: string
  verification_status: string

  verified_at: string
}


export type AttendanceDataResult = {
  month: string
  from: string
  to: string

  personNames:
    Record<string, string>

  employees: any[]
  units: any[]

  schedule: Shift[]

  entries:
    AttendanceEntry[]

  requests: any[]
  trips: any[]
  policies: any[]
  history: any[]

  reviews: any[]
  tripReviews: any[]
}


export async function attendanceData(
  db: SupabaseClient,
  p: Params,
  mode:
    | 'attendance'
    | 'leave'
    | 'policy'
    = 'attendance',
): Promise<AttendanceDataResult> {

  const range =
    monthRange(p.month)


  const result =
    await Promise.all([

      db
        .from(
          'employee_directory',
        )
        .select(
          'id,employee_code,full_name',
        )
        .order(
          'employee_code',
        )
        .limit(100),


      db
        .from(
          'organization_units',
        )
        .select(
          'code,name,branch_id',
        )
        .order('code'),


      p.employee
      && mode !== 'policy'

        ? db.rpc(
            'employee_schedule',
            {
              p_employee:
                p.employee,

              p_from:
                range.from,

              p_to:
                range.to,
            },
          )

        : Promise.resolve({
            data: [],
            error: null,
          }),


      p.employee
      && mode !== 'policy'

        ? db
            .from(
              'employee_attendance_current',
            )
            .select('*')
            .eq(
              'employee_id',
              p.employee,
            )
            .gte(
              'work_date',
              range.from,
            )
            .lte(
              'work_date',
              range.to,
            )
            .order(
              'work_date',
            )
            .order(
              'shift_code',
            )
            .returns<
              AttendanceEntryRow[]
            >()

        : Promise.resolve({
            data: [],
            error: null,
          }),


      p.employee
      && mode !== 'policy'

        ? db
            .from(
              'employee_attendance_requests',
            )
            .select('*')
            .in(
              'proposed_status',

              attendanceStates
                .filter(
                  (state) =>
                    mode === 'leave'
                      ? isLeave(
                          state.id,
                        )
                      : !isLeave(
                          state.id,
                        ),
                )
                .map(
                  (state) =>
                    state.id,
                ),
            )
            .eq(
              'employee_id',
              p.employee,
            )
            .gte(
              'work_date',
              range.from,
            )
            .lte(
              'work_date',
              range.to,
            )
            .order(
              'created_at',
              {
                ascending:
                  false,
              },
            )
            .limit(100)

        : Promise.resolve({
            data: [],
            error: null,
          }),


      p.employee
      && mode === 'attendance'

        ? db
            .from(
              'employee_trips',
            )
            .select('*')
            .eq(
              'employee_id',
              p.employee,
            )
            .lte(
              'starts_on',
              range.to,
            )
            .gte(
              'ends_on',
              range.from,
            )
            .order(
              'starts_on',
            )

        : Promise.resolve({
            data: [],
            error: null,
          }),


      mode === 'policy'

        ? db
            .from(
              'employee_leave_policies',
            )
            .select('*')
            .lte(
              'starts_on',
              range.to,
            )
            .gte(
              'ends_on',
              range.from,
            )
            .order(
              'starts_on',
              {
                ascending:
                  false,
              },
            )
            .limit(100)

        : Promise.resolve({
            data: [],
            error: null,
          }),


      p.employee
      && mode !== 'policy'

        ? db
            .from(
              'employee_attendance_entries',
            )
            .select(
              [
                'id',
                'work_date',
                'shift_code',
                'revision',
                'status',
                'entry_kind',
                'reason',
                'actor',
                'checker',
                'created_at',
              ].join(','),
            )
            .eq(
              'employee_id',
              p.employee,
            )
            .gte(
              'work_date',
              range.from,
            )
            .lte(
              'work_date',
              range.to,
            )
            .order(
              'created_at',
              {
                ascending:
                  false,
              },
            )
            .limit(100)

        : Promise.resolve({
            data: [],
            error: null,
          }),


      p.employee
      && mode !== 'policy'

        ? db.rpc(
            'get_employee_attendance_qr_verified_entries',
            {
              p_employee:
                p.employee,

              p_from:
                range.from,

              p_to:
                range.to,
            },
          )

        : Promise.resolve({
            data: [],
            error: null,
          }),

    ])


  if (
    result.some(
      (item) =>
        item.error,
    )
  ) {
    throw new Error(
      'Attendance data unavailable',
    )
  }


  const employees =
    result[0].data || []

  const units =
    result[1].data || []

  const schedule =
    (
      result[2].data || []
    ) as Shift[]

  const rawEntries: AttendanceEntryRow[] =
    (result[3].data || []) as unknown as AttendanceEntryRow[]

  const requests =
    result[4].data || []

  const trips =
    result[5].data || []

  const policies =
    result[6].data || []

  const history =
    result[7].data || []

  const qrRows: QrVerification[] =
    (result[8].data || []) as unknown as QrVerification[]


  const verified =
    new Set<string>(
      qrRows
        .filter(
          (row) =>
            row.verification_status
            === 'VERIFIED',
        )
        .map(
          (row) =>
            row.work_date
            + '|'
            + row.shift_code,
        ),
    )


  const entries:
    AttendanceEntry[] =
      rawEntries.map(
        (entry) => ({
          ...entry,

          qr_verified:
            verified.has(
              entry.work_date
              + '|'
              + entry.shift_code,
            ),
        }),
      )


  const reviewResults =
    await Promise.all([

      requests.length

        ? db
            .from(
              'employee_attendance_reviews',
            )
            .select(
              'request_id,decision,checker,created_at,reason',
            )
            .in(
              'request_id',

              requests.map(
                (
                  request: any,
                ) =>
                  request.id,
              ),
            )

        : Promise.resolve({
            data: [],
            error: null,
          }),


      trips.length

        ? db
            .from(
              'employee_trip_reviews',
            )
            .select(
              'trip_id,decision,checker',
            )
            .in(
              'trip_id',

              trips.map(
                (
                  trip: any,
                ) =>
                  trip.id,
              ),
            )

        : Promise.resolve({
            data: [],
            error: null,
          }),

    ])


  if (
    reviewResults.some(
      (item) =>
        item.error,
    )
  ) {
    throw new Error(
      'Review data unavailable',
    )
  }


  const reviews =
    reviewResults[0].data || []

  const tripReviews =
    reviewResults[1].data || []


  const personIds =
    [
      ...new Set<string>(
        [

          ...requests.map(
            (
              request: any,
            ) =>
              request.maker,
          ),


          ...history.flatMap(
            (
              item: any,
            ) => [
              item.actor,
              item.checker,
            ],
          ),


          ...policies.map(
            (
              policy: any,
            ) =>
              policy.actor,
          ),


          ...reviews.map(
            (
              review: any,
            ) =>
              review.checker,
          ),

        ].filter(
          (
            id,
          ): id is string =>
            Boolean(id),
        ),
      ),
    ]


  const people =
    personIds.length

      ? await db
          .from('profiles')
          .select(
            'id,full_name',
          )
          .in(
            'id',
            personIds,
          )

      : {
          data: [],
          error: null,
        }


  if (people.error) {
    throw new Error(
      'Audit names unavailable',
    )
  }


  const personNames:
    Record<string, string> =
      Object.fromEntries(
        (
          people.data || []
        ).map(
          (
            person: {
              id: string
              full_name:
                | string
                | null
            },
          ) => [
            person.id,

            person.full_name
            || 'Tài khoản quản trị',
          ],
        ),
      )


  return {
    ...range,

    personNames,

    employees,
    units,

    schedule:
      schedule.filter(
        (shift) =>
          !p.unit
          || shift.unit_code
            === p.unit,
      ),

    entries,

    requests,
    trips,
    policies,
    history,

    reviews,
    tripReviews,
  }
}
