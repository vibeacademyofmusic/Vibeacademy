'use client'

type DeleteScheduleButtonProps = {
  scheduleLabel: string
}

export default function DeleteScheduleButton({
  scheduleLabel,
}: DeleteScheduleButtonProps) {
  return (
    <button
      type="submit"
      onClick={(event) => {
        if (
          !window.confirm(
            `Delete ${scheduleLabel}? This cannot be undone.`
          )
        ) {
          event.preventDefault()
        }
      }}
      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50"
    >
      Delete
    </button>
  )
}
