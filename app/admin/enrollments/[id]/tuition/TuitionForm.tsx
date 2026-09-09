'use client'

import { useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createTuitionTerm } from './actions'

type PriceOption = {
  planId: string
  planName: string
  durationMonths: number
  listPrice: number
}

type TuitionFormProps = {
  enrollmentId: string
  branchName: string
  startsOn: string
  isRenewal: boolean
  options: PriceOption[]
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(
    new Date(`${value}T00:00:00+07:00`)
  )
}
function SubmitButton({
    isRenewal,
    hasSelectedPlan,
  }: {
    isRenewal: boolean
    hasSelectedPlan: boolean
  }) {
    const { pending } = useFormStatus()

    return (
      <button
        type="submit"
        disabled={pending || !hasSelectedPlan}
        className="rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? 'Đang xử lý...'
          : isRenewal
            ? 'Tạo kỳ gia hạn'
            : 'Tạo kỳ học phí'}
      </button>
    )
  }

export default function TuitionForm({
  enrollmentId,
  branchName,
  startsOn,
  isRenewal,
  options,
}: TuitionFormProps) {
  const [planId, setPlanId] =
    useState(options[0]?.planId ?? '')

  const [discountType, setDiscountType] =
    useState('NONE')

  const [discountValue, setDiscountValue] =
    useState('')

  const selectedPlan = useMemo(
    () =>
      options.find(
        (option) => option.planId === planId
      ) ?? null,
    [options, planId]
  )

  const discount = useMemo(() => {
    if (!selectedPlan) return 0

    const value = Number(discountValue || 0)

    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      return 0
    }

    if (discountType === 'PERCENT') {
      const percent = Math.min(value, 100)

      return (
        selectedPlan.listPrice *
        percent /
        100
      )
    }

    if (discountType === 'FIXED') {
      return Math.min(
        value,
        selectedPlan.listPrice
      )
    }

    return 0
  }, [
    selectedPlan,
    discountType,
    discountValue,
  ])

  const finalAmount = selectedPlan
    ? Math.max(
        selectedPlan.listPrice - discount,
        0
      )
    : 0

  return (
    <form
      action={createTuitionTerm}
      className="mt-5 space-y-6"
    >
      <input
        type="hidden"
        name="enrollment_id"
        value={enrollmentId}
      />

      <section className="rounded-xl bg-gray-50 p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Chi nhánh
            </p>

            <p className="mt-1 font-semibold text-gray-950">
              {branchName}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Ngày bắt đầu kỳ
            </p>

            <p className="mt-1 font-semibold text-gray-950">
              {formatDate(startsOn)}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Loại
            </p>

            <p className="mt-1 font-semibold text-gray-950">
              {isRenewal
                ? 'Gia hạn'
                : 'Kỳ học phí đầu tiên'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">
            Gói học phí
          </span>

          <select
            name="tuition_plan_id"
            value={planId}
            onChange={(event) =>
              setPlanId(event.target.value)
            }
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
          >
            {options.map((option) => (
              <option
                key={option.planId}
                value={option.planId}
              >
                {option.planName}
                {' — '}
                {formatMoney(
                  option.listPrice
                )}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="text-sm font-medium text-gray-700">
            Học phí niêm yết
          </p>

          <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-lg font-bold text-gray-950">
            {selectedPlan
              ? formatMoney(
                  selectedPlan.listPrice
                )
              : '—'}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-950">
          Giảm giá / Chương trình ưu đãi
        </h3>

        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Loại giảm giá
            </span>

            <select
              name="discount_type"
              value={discountType}
              onChange={(event) => {
                setDiscountType(
                  event.target.value
                )
                setDiscountValue('')
              }}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              <option value="NONE">
                Không giảm giá
              </option>

              <option value="PERCENT">
                Giảm theo %
              </option>

              <option value="FIXED">
                Giảm số tiền cố định
              </option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              {discountType === 'PERCENT'
                ? 'Mức giảm (%)'
                : discountType === 'FIXED'
                  ? 'Số tiền giảm'
                  : 'Mức giảm'}
            </span>

            <input
              type="number"
              name="discount_value"
              value={discountValue}
              onChange={(event) =>
                setDiscountValue(
                  event.target.value
                )
              }
              disabled={
                discountType === 'NONE'
              }
              min="0"
              max={
                discountType === 'PERCENT'
                  ? '100'
                  : undefined
              }
              step="1"
              placeholder={
                discountType === 'PERCENT'
                  ? 'Ví dụ: 10'
                  : discountType === 'FIXED'
                    ? 'Ví dụ: 500000'
                    : ''
              }
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
            />
          </label>
        </div>

        {discountType !== 'NONE' && (
          <label className="mt-5 block">
            <span className="text-sm font-medium text-gray-700">
              Tên chương trình / Lý do giảm giá
            </span>

            <input
              type="text"
              name="discount_name"
              maxLength={300}
              required
              placeholder="Ví dụ: Ưu đãi khai giảng, học viên cũ, anh chị em..."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
        )}
      </section>

      <section className="rounded-xl border-2 border-gray-950 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Giá niêm yết
            </p>

            <p className="mt-1 font-semibold">
              {selectedPlan
                ? formatMoney(
                    selectedPlan.listPrice
                  )
                : '—'}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Giảm giá
            </p>

            <p className="mt-1 font-semibold">
              − {formatMoney(discount)}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Thành tiền
            </p>

            <p className="mt-1 text-xl font-bold text-gray-950">
              {formatMoney(finalAmount)}
            </p>
          </div>
        </div>
      </section>

      <label className="block">
        <span className="text-sm font-medium text-gray-700">
          Ghi chú nội bộ
        </span>

        <textarea
          name="notes"
          maxLength={2000}
          rows={3}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
          placeholder="Ghi chú nếu cần"
        />
      </label>

      <SubmitButton
  isRenewal={isRenewal}
  hasSelectedPlan={Boolean(selectedPlan)}
/>
</form>
  )
}