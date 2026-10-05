import Link from 'next/link'
import { UpdatePasswordForm } from './form'

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <main className="vibe-admin flex min-h-screen items-center justify-center px-4 py-10">
      <section className="vibe-card w-full max-w-md">
        <h1>Đặt mật khẩu mới</h1>
        <p className="mt-2 text-sm text-[var(--vibe-muted)]">Nhập mật khẩu mới cho tài khoản thí điểm. Mật khẩu này dùng để đăng nhập bản xem trước.</p>
        {error ? <p className="mt-4 text-sm text-[var(--vibe-danger,#9b2c2c)]">{error}</p> : null}
        <UpdatePasswordForm />
        <p className="mt-6 text-sm"><Link className="underline" href="/login">Quay lại đăng nhập</Link></p>
      </section>
    </main>
  )
}
