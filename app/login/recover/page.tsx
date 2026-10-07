import Link from 'next/link'
import AuthShell from '@/app/_components/auth/AuthShell'
import styles from '@/app/_components/auth/auth-shell.module.css'
import { sendPasswordSetup } from './actions'

export default async function RecoverPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <AuthShell title="Thiết lập mật khẩu" description="Nhập email tài khoản. Trang đặt mật khẩu mở ngay sau khi xác nhận.">
      {error ? <p className={styles.alert} role="alert">{error}</p> : null}
      <form action={sendPasswordSetup} className={styles.form}>
        <label className={styles.field} htmlFor="email">
          <span>Email</span>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </label>
        <button className={styles.submit} type="submit">Tiếp tục đặt mật khẩu</button>
      </form>
      <p className={styles.secondary}><Link href="/login">Quay lại đăng nhập</Link></p>
    </AuthShell>
  )
}
