'use client'

type DeleteCourseButtonProps = {
  courseName: string
}

export default function DeleteCourseButton({
  courseName,
}: DeleteCourseButtonProps) {
  return (
    <button
      type="submit"
      onClick={(event) => {
        if (
          !window.confirm(
            `Delete course ${courseName}? This cannot be undone.`
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
