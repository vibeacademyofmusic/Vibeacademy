import Link from 'next/link'
import { updatePassword } from './actions'

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
        <p className="mt-2 text-sm text-[var(--vibe-muted)]">Dùng liên kết vừa gửi trong email. Mật khẩu mới chỉ áp dụng cho bản xem trước này.</p>
        {error ? <p className="mt-4 text-sm text-[var(--vibe-danger,#9b2c2c)]">{error}</p> : null}
        <form action={updatePassword} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-[var(--vibe-navy)]" htmlFor="password">
            Mật khẩu mới
            <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="mt-2 w-full border px-3 py-2" />
          </label>
          <label className="block text-sm font-semibold text-[var(--vibe-navy)]" htmlFor="confirm">
            Nhập lại mật khẩu
            <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="mt-2 w-full border px-3 py-2" />
          </label>
          <button className="vibe-button vibe-button-primary w-full" type="submit">Lưu mật khẩu</button>
        </form>
        <p className="mt-6 text-sm"><Link className="underline" href="/login">Quay lại đăng nhập</Link></p>
      </section>
    </main>
  )
}
