'use client'

import { useState } from 'react'
import Link from 'next/link'

import {
  Drawer,
} from '../../_components/vibe/interactive'

import {
  dayState,
  stateNames,
  type Evidence,
  type Request,
} from './model'

import type {
  Shift,
} from '../../employees/attendance/data'

export type Person = {
  id: string
  name: string
  code: string
  unavailable: boolean
  schedule: Shift[]
  entries: Evidence[]
  requests: Request[]
  reviewed: string[]
  history: Evidence[]
}

const marks = {
  worked: '✓',
  qr: 'QR',
  missing: '?',
  leave: 'P',
  off: '—',
  future: '·',
  pending: '…',
  exception: '!',
  late: '!',
  unavailable: '×',
}

const statusNames: Record<string, string> = {
  WORKED: 'Đã làm việc',
  SCHEDULED_OFF: 'Nghỉ theo lịch',
  PAID_LEAVE: 'Nghỉ phép có lương',
  UNPAID_LEAVE: 'Nghỉ không lương',
  UNAUTHORIZED_ABSENCE: 'Vắng không phép',
  BUSINESS_TRIP: 'Công tác',
  LATE: 'Đi muộn',
  EARLY_LEAVE: 'Về sớm',
}

const scheduleNames: Record<string, string> = {
  SCHEDULED: 'Có ca',
  BUSINESS_TRIP: 'Công tác',
  SCHEDULED_OFF: 'Nghỉ theo lịch',
}

function shiftName(code: string) {
  if (code === 'AM') return 'Sáng'
  if (code === 'PM') return 'Chiều'
  return code
}

function clock(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function Matrix({
  people,
  days,
  today,
}: {
  people: Person[]
  days: string[]
  today: string
}) {
  const [
    selected,
    setSelected,
  ] = useState<{
    person: Person
    date: string
  } | null>(null)

  return (
    <>
      <div className="vibe-actions">
        {Object.entries(
          stateNames,
        ).map(([key, name]) => (
          <span
            key={key}
            className="vibe-badge"
          >
            {name}
          </span>
        ))}
      </div>

      <div
        className="vibe-table-scroll"
        style={{
          maxHeight: '65vh',
        }}
      >
        <table className="vibe-table hr-matrix">
          <thead>
            <tr>
              <th>Nhân viên</th>

              {days.map((d) => (
                <th key={d}>
                  {Number(d.slice(-2))}
                </th>
              ))}

              <th>Thiếu / chờ</th>
            </tr>
          </thead>

          <tbody>
            {people.map((person) => {
              const states = days.map(
                (date) =>
                  person.unavailable
                    ? 'unavailable'
                    : dayState(
                        date,
                        today,
                        person.schedule,
                        person.entries,
                        person.requests,
                        new Set(
                          person.reviewed,
                        ),
                      ),
              )

              return (
                <tr key={person.id}>
                  <th scope="row">
                    {person.name}

                    <small className="block">
                      {person.code}
                    </small>
                  </th>

                  {days.map(
                    (date, index) => {
                      const state =
                        states[index]

                      return (
                        <td key={date}>
                          <button
                            className="hr-day"
                            data-state={state}
                            title={
                              `${person.name} · ${date} · ${stateNames[state]}`
                            }
                            aria-label={
                              `${person.name}, ${date}: ${stateNames[state]}`
                            }
                            onClick={() =>
                              setSelected({
                                person,
                                date,
                              })
                            }
                          >
                            {marks[state]}
                          </button>
                        </td>
                      )
                    },
                  )}

                  <td>
                    {person.unavailable
                      ? '—'
                      : states.filter(
                          (state) =>
                            state === 'missing'
                            || state === 'pending',
                        ).length}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!people.length && (
        <p className="vibe-empty">
          Chưa có nhân viên trong bộ lọc.
        </p>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() =>
          setSelected(null)
        }
        title={
          selected
            ? `${selected.person.name} · ${selected.date}`
            : 'Chi tiết công'
        }
      >
        {selected && (
          <div className="vibe-page">
            <p>
              Thiếu bằng chứng không tự động
              là nghỉ không lương. QR hợp lệ
              và duyệt thủ công là hai nguồn
              xác nhận độc lập.
            </p>

            {selected.person.unavailable ? (
              <p>
                Không đọc đủ nguồn cho nhân
                viên này.
              </p>
            ) : (
              <>
                {[
                  [
                    'Lịch làm việc',
                    selected.person.schedule
                      .filter(
                        (s) =>
                          s.work_date
                          === selected.date,
                      )
                      .map(
                        (s) =>
                          `${shiftName(s.shift_code)} · ${clock(s.starts_at)} – ${clock(s.ends_at)} · ${s.scheduled_minutes} phút · ${scheduleNames[s.schedule_state] || 'Có ca'}`,
                      ),
                  ],

                  [
                    'Công thực tế',
                    selected.person.entries
                      .filter(
                        (e) =>
                          e.work_date
                          === selected.date,
                      )
                      .map(
                        (e) =>
                          `${shiftName(e.shift_code)} · ${statusNames[e.status] || 'Đã ghi nhận'} · Vào ca ${clock(e.arrived_at)} · Ra ca ${clock(e.departed_at)} · Đi muộn ${e.late_minutes ?? 0} phút · Về sớm ${e.early_minutes ?? 0} phút · ${
                            e.qr_verified
                              ? 'QR hệ thống'
                              : e.checker
                                ? 'Duyệt thủ công'
                                : 'Chưa xác nhận'
                          }`,
                      ),
                  ],

                  [
                    'Yêu cầu điều chỉnh',
                    selected.person.requests
                      .filter(
                        (r) =>
                          r.work_date
                          === selected.date,
                      )
                      .map(
                        (r) =>
                          `${statusNames[r.proposed_status] || 'Điều chỉnh'}: ${r.reason} · ${
                            selected.person.reviewed.includes(
                              r.id,
                            )
                              ? 'Đã có quyết định'
                              : 'Chờ xử lý'
                          }`,
                      ),
                  ],

                  [
                    'Lịch sử',
                    selected.person.history
                      .filter(
                        (h) =>
                          h.work_date
                          === selected.date,
                      )
                      .map(
                        (h) =>
                          `${clock(h.created_at)} · Phiên bản ${h.revision ?? '—'} · ${statusNames[h.status] || 'Đã ghi nhận'} · ${h.reason || ''} · ${
                            h.qr_verified
                              ? 'QR hệ thống'
                              : h.checker
                                ? 'Người duyệt đã ghi'
                                : 'Chưa có người duyệt'
                          }`,
                      ),
                  ],
                ].map(
                  ([title, items]) => (
                    <section
                      className="vibe-card"
                      key={title as string}
                    >
                      <h3>{title}</h3>

                      {(items as string[])
                        .length
                        ? (
                            items as string[]
                          ).map(
                            (line, i) => (
                              <p key={i}>
                                {line}
                              </p>
                            ),
                          )
                        : (
                          <p>
                            Không có dữ liệu
                            trong nguồn đã đọc.
                          </p>
                        )}
                    </section>
                  ),
                )}
              </>
            )}

            <Link
              className="vibe-button"
              href={
                `/admin/employees/attendance?employee=${selected.person.id}&month=${selected.date.slice(0, 7)}`
              }
            >
              Mở công & xử lý yêu cầu →
            </Link>
          </div>
        )}
      </Drawer>
    </>
  )
}
