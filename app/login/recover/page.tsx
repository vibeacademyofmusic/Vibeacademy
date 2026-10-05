import Link from 'next/link'
import { sendPasswordSetup } from './actions'

export default async function RecoverPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <main className="vibe-admin flex min-h-screen items-center justify-center px-4 py-10">
      <section className="vibe-card w-full max-w-md">
        <h1>Thiết lập mật khẩu</h1>
        <p className="mt-2 text-sm text-[var(--vibe-muted)]">
          Nhập email tài khoản thí điểm. Trang đặt mật khẩu mở ngay trên bản xem trước này.
        </p>
        {error ? <p className="mt-4 text-sm text-[var(--vibe-danger,#9b2c2c)]">{error}</p> : null}
        <form action={sendPasswordSetup} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-[var(--vibe-navy)]" htmlFor="email">
            Email
            <input id="email" name="email" type="email" required autoComplete="email" className="mt-2 w-full border px-3 py-2" />
          </label>
          <button className="vibe-button vibe-button-primary w-full" type="submit">Tiếp tục đặt mật khẩu</button>
        </form>
        <p className="mt-6 text-sm"><Link className="underline" href="/login">Quay lại đăng nhập</Link></p>
      </section>
    </main>
  )
}
