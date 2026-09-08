import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-20 text-center">
      <h1 className="text-2xl font-bold">Không tìm thấy trang</h1>
      <p className="mt-3 text-gray-600">Trang hoặc thông tin bạn yêu cầu không tồn tại hoặc đã được chuyển đi.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-gray-950 px-5 py-3 text-white">Về trang chủ</Link>
    </main>
  )
}
