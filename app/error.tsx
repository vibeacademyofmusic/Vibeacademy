'use client'

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main
      className="mx-auto max-w-lg px-6 py-20 text-center"
      role="alert"
    >
      <h1 className="text-2xl font-bold">
        Không thể tải nội dung
      </h1>

      <p className="mt-3 text-gray-600">
        Đã xảy ra lỗi. Vui lòng thử lại hoặc liên hệ quản trị viên nếu lỗi vẫn tiếp diễn.
      </p>

      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-lg bg-gray-950 px-5 py-3 text-white"
      >
        Thử lại
      </button>
    </main>
  )
}