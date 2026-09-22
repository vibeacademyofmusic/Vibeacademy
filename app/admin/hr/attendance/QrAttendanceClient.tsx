'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import * as QRCode from 'qrcode'

import {
  getQrRecentScansAction,
  getQrStatusAction,
  mintQrTokenAction,
  startQrSessionAction,
  stopQrSessionAction,
} from './qr-actions'

import { attendanceScanUrl } from './scan-url'

type Branch = {
  id: string
  name: string
  code?: string
}

type Scan = {
  id: string
  employee_id: string
  employee_code?: string | null
  employee_name?: string | null
  work_date?: string
  shift_code: string
  event_type:
    | 'CHECK_IN'
    | 'CHECK_OUT'
  scanned_at: string
  verification_status?:
    | 'WAITING_CHECK_OUT'
    | 'VERIFIED'
    | 'CONFLICT'
    | 'PENDING'
}

function shiftName(code: string) {
  if (code === 'AM') return 'Sáng'
  if (code === 'PM') return 'Chiều'
  return '—'
}

function scanStatus(scan: Scan) {
  if (
    scan.event_type === 'CHECK_IN'
  ) {
    return 'Đã vào ca'
  }

  if (
    scan.verification_status
    === 'VERIFIED'
  ) {
    return 'Đã xác nhận QR'
  }

  if (
    scan.verification_status
    === 'CONFLICT'
  ) {
    return 'Cần xử lý'
  }

  return 'Đã ra ca'
}

export default function QrAttendanceClient({
  branches,
}: {
  branches: Branch[]
}) {
  const [
    branchId,
    setBranchId,
  ] = useState(
    branches[0]?.id ?? '',
  )

  const [
    sessionId,
    setSessionId,
  ] = useState<string | null>(
    null,
  )

  const [
    token,
    setToken,
  ] = useState('')

  const [
    expiresAt,
    setExpiresAt,
  ] = useState('')

  const [
    qrImage,
    setQrImage,
  ] = useState('')

  const [
    secondsLeft,
    setSecondsLeft,
  ] = useState(0)

  const [
    scans,
    setScans,
  ] = useState<Scan[] | null>(
    null,
  )

  const [
    error,
    setError,
  ] = useState('')

  const [
    busy,
    setBusy,
  ] = useState(false)

  const rotationTimer =
    useRef<
      ReturnType<typeof setTimeout>
      | undefined
    >(undefined)

  const branch = useMemo(
    () =>
      branches.find(
        (item) =>
          item.id === branchId,
      ),
    [branches, branchId],
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!branchId) {
        setSessionId(null)
        return
      }

      setError('')
      setToken('')
      setQrImage('')
      setExpiresAt('')

      const result =
        await getQrStatusAction(
          branchId,
        )

      if (cancelled) return

      if (!result.ok) {
        setError(result.error)
        setSessionId(null)
        return
      }

      const data = result.data as any

      if (
        data?.status === 'ACTIVE'
        && data?.session_id
      ) {
        setSessionId(
          String(data.session_id),
        )
      } else {
        setSessionId(null)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [branchId])

  useEffect(() => {
    let cancelled = false

    async function rotate() {
      if (!sessionId) return

      const result =
        await mintQrTokenAction(
          sessionId,
        )

      if (cancelled) return

      if (!result.ok) {
        setError(result.error)
        return
      }

      const data = result.data as any

      setToken(
        String(data.token ?? ''),
      )

      setExpiresAt(
        String(
          data.expires_at ?? '',
        ),
      )

      setError('')

      rotationTimer.current =
        setTimeout(
          rotate,
          55000,
        )
    }

    if (sessionId) {
      rotate()
    } else {
      setToken('')
      setQrImage('')
      setExpiresAt('')
    }

    return () => {
      cancelled = true

      if (
        rotationTimer.current
      ) {
        clearTimeout(
          rotationTimer.current,
        )
      }
    }
  }, [sessionId])

  useEffect(() => {
    if (!token) {
      setQrImage('')
      return
    }

    let cancelled = false

    const url = attendanceScanUrl(
      token,
      process.env.NEXT_PUBLIC_APP_URL,
      window.location.origin,
    )

    QRCode
      .toDataURL(
        url,
        {
          width: 360,
          margin: 2,
          errorCorrectionLevel: 'M',
        },
      )
      .then((image) => {
        if (!cancelled) {
          setQrImage(image)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            'Không thể tạo mã QR.',
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    const timer =
      setInterval(() => {
        if (!expiresAt) {
          setSecondsLeft(0)
          return
        }

        setSecondsLeft(
          Math.max(
            0,
            Math.ceil(
              (
                new Date(
                  expiresAt,
                ).getTime()
                - Date.now()
              ) / 1000,
            ),
          ),
        )
      }, 250)

    return () =>
      clearInterval(timer)
  }, [expiresAt])

  useEffect(() => {
    let cancelled = false

    async function loadScans() {
      if (!branchId) {
        setScans([])
        return
      }

      const result =
        await getQrRecentScansAction(
          branchId,
        )

      if (cancelled) return

      if (!result.ok) {
        setError(result.error)
        setScans(null)
        return
      }

      const rows = Array.isArray(result.data)
        ? result.data
        : []

      setScans(rows as Scan[])
    }

    loadScans()

    const timer =
      setInterval(
        loadScans,
        5000,
      )

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [branchId])

  async function start() {
    if (
      !branchId
      || busy
    ) {
      return
    }

    setBusy(true)
    setError('')

    const result =
      await startQrSessionAction(
        branchId,
      )

    setBusy(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    const data =
      result.data as any

    if (data?.session_id) {
      setSessionId(
        String(data.session_id),
      )
    }
  }

  async function stop() {
    if (
      !sessionId
      || busy
    ) {
      return
    }

    setBusy(true)
    setError('')

    const result =
      await stopQrSessionAction(
        sessionId,
      )

    setBusy(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setSessionId(null)
    setToken('')
    setQrImage('')
    setExpiresAt('')
    setSecondsLeft(0)
  }

  if (!branches.length) {
    return (
      <section className="vibe-card">
        <h2>QR chấm công</h2>

        <p className="vibe-empty">
          Tài khoản chưa có chi nhánh
          được phép quản lý chấm công.
        </p>
      </section>
    )
  }

  return (
    <section className="vibe-card">
      <div className="vibe-actions">
        <div>
          <h2>
            QR chấm công
          </h2>

          <p>
            Mã tự đổi mỗi 60 giây.
            Nhân viên phải dùng tài khoản
            của chính mình.
          </p>
        </div>

        <label className="vibe-field">
          <span>Chi nhánh</span>

          <select
            value={branchId}
            onChange={(event) =>
              setBranchId(
                event.target.value,
              )
            }
          >
            {branches.map(
              (item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.name}
                </option>
              ),
            )}
          </select>
        </label>

        {sessionId ? (
          <>
            <span className="vibe-badge">
              Đang hoạt động
            </span>

            <button
              type="button"
              className="vibe-button"
              onClick={stop}
              disabled={busy}
            >
              Dừng QR
            </button>
          </>
        ) : (
          <button
            type="button"
            className="vibe-button"
            onClick={start}
            disabled={busy}
          >
            Mở chấm công
          </button>
        )}
      </div>

      {error && (
        <div className="vibe-card">
          <strong>
            Không thể thực hiện
          </strong>

          <p>{error}</p>
        </div>
      )}

      <div className="vibe-grid">
        <section className="vibe-card">
          {sessionId && qrImage ? (
            <div
              style={{
                textAlign: 'center',
              }}
            >
              <img
                src={qrImage}
                alt="QR chấm công VIBE"
                style={{
                  display: 'block',
                  width: '100%',
                  maxWidth: 360,
                  margin: '0 auto',
                }}
              />

              <h3>
                {branch?.name}
              </h3>

              <div
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 700,
                  fontVariantNumeric:
                    'tabular-nums',
                }}
              >
                {secondsLeft}s
              </div>

              <p>
                Hết thời gian hệ thống
                tự sinh mã mới.
              </p>
            </div>
          ) : (
            <p className="vibe-empty">
              {sessionId
                ? 'Đang tạo mã QR...'
                : 'Mở chấm công để bắt đầu.'}
            </p>
          )}
        </section>

        <section className="vibe-card">
          <h3>
            Hoạt động gần đây
          </h3>

          {scans === null ? (
            <p>—</p>
          ) : !scans.length ? (
            <p className="vibe-empty">
              Chưa có lượt quét.
            </p>
          ) : (
            <div className="vibe-table-scroll">
              <table className="vibe-table">
                <thead>
                  <tr>
                    <th>Nhân viên</th>
                    <th>Mã nhân viên</th>
                    <th>Ca</th>
                    <th>Vào ca / Ra ca</th>
                    <th>Trạng thái</th>
                    <th>Thời gian</th>
                  </tr>
                </thead>

                <tbody>
                  {scans.map(
                    (scan) => (
                      <tr key={scan.id}>
                        <td>
                          <strong>
                            {scan.employee_name
                              || 'Nhân viên'}
                          </strong>
                        </td>

                        <td>
                          {scan.employee_code
                            || '—'}
                        </td>

                        <td>
                          {shiftName(
                            scan.shift_code,
                          )}
                        </td>

                        <td>
                          {scan.event_type
                            === 'CHECK_IN'
                            ? 'Vào ca'
                            : 'Ra ca'}
                        </td>

                        <td>
                          <span className="vibe-badge">
                            {scanStatus(scan)}
                          </span>
                        </td>

                        <td>
                          {new Date(
                            scan.scanned_at,
                          ).toLocaleTimeString(
                            'vi-VN',
                            {
                              timeZone:
                                'Asia/Ho_Chi_Minh',
                              hour:
                                '2-digit',
                              minute:
                                '2-digit',
                              second:
                                '2-digit',
                            },
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="vibe-card">
        <h3>Vấn đề từ QR</h3>
        {scans === null ? (
          <p>—</p>
        ) : !scanIssues(scans).length ? (
          <p className="vibe-empty">
            Không có vào ca thiếu ra ca
            trong các lượt vừa tải.
          </p>
        ) : (
          scanIssues(scans).map(
            (line) => (
              <p key={line}>{line}</p>
            ),
          )
        )}
      </section>
    </section>
  )
}

function scanIssues(scans: Scan[]) {
  const groups = new Map<string, Scan[]>()

  for (const scan of scans) {
    const key = [
      scan.employee_id,
      scan.work_date || '',
      scan.shift_code,
    ].join('|')
    const list = groups.get(key) || []
    list.push(scan)
    groups.set(key, list)
  }

  const lines: string[] = []

  for (const group of groups.values()) {
    const name =
      group[0].employee_name
      || group[0].employee_code
      || 'Nhân viên'
    const hasIn = group.some(
      (scan) =>
        scan.event_type === 'CHECK_IN',
    )
    const hasOut = group.some(
      (scan) =>
        scan.event_type === 'CHECK_OUT',
    )

    if (hasIn && !hasOut) {
      lines.push(
        name
        + ' · Có vào ca, thiếu ra ca',
      )
    }

    if (
      group.some(
        (scan) =>
          scan.verification_status
          === 'CONFLICT',
      )
    ) {
      lines.push(
        name
        + ' · Cần xử lý',
      )
    }
  }

  return lines
}
