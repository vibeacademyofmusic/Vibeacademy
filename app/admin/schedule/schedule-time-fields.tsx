'use client'

import { useMemo, useState } from 'react'

type Period = 'AM' | 'PM'

function parseClockTime(value: string, period: Period) {
  const match = value.trim().match(/^(\d{1,2})(?::([0-5]\d))?$/)

  if (!match) {
    return null
  }

  const hour = Number(match[1])
  const minute = Number(match[2] ?? '0')

  if (hour < 1 || hour > 12) {
    return null
  }

  return (hour % 12) * 60 + minute +
    (period === 'PM' ? 12 * 60 : 0)
}

function formatClockTime(totalMinutes: number) {
  const normalized = totalMinutes % (24 * 60)
  const hour24 = Math.floor(normalized / 60)
  const minute = normalized % 60
  const period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12

  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}

export default function ScheduleTimeFields() {
  const [startTime, setStartTime] = useState('6:00')
  const [period, setPeriod] = useState<Period>('PM')
  const [duration, setDuration] = useState(90)

  const endTime = useMemo(() => {
    const startMinutes = parseClockTime(startTime, period)

    if (startMinutes === null || duration < 15) {
      return null
    }

    if (startMinutes + duration >= 24 * 60) {
      return 'Next day is not supported'
    }

    return formatClockTime(startMinutes + duration)
  }, [duration, period, startTime])

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-700">
        Class time *
      </p>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_120px] sm:items-end">
        <label className="text-xs font-medium text-gray-500">
          Start time

          <input
            type="text"
            name="start_time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            required
            inputMode="numeric"
            placeholder="6:00"
            pattern="(?:[1-9]|1[0-2])(?::[0-5][0-9])?"
            title="Enter a time such as 6:00 or 7:30"
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
          />
        </label>

        <div>
          <input type="hidden" name="start_period" value={period} />

          <div className="flex rounded-lg border border-gray-300 bg-gray-50 p-1">
            {(['AM', 'PM'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                aria-pressed={period === value}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                  period === value
                    ? 'bg-gray-950 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <label className="text-xs font-medium text-gray-500">
          Duration

          <select
            name="duration_minutes"
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-900"
          >
            <option value={45}>45 min</option>
            <option value={60}>1 hour</option>
            <option value={90}>1h 30m</option>
            <option value={120}>2 hours</option>
          </select>
        </label>
      </div>

      <p className={`mt-2 text-sm ${
        endTime === 'Next day is not supported'
          ? 'text-red-600'
          : 'text-gray-500'
      }`}>
        Ends at: <span className="font-semibold">{endTime ?? '—'}</span>
      </p>
    </div>
  )
}
