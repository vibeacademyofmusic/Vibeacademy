import Link from 'next/link'
import AuthShell from '@/app/_components/auth/AuthShell'
import styles from '@/app/_components/auth/auth-shell.module.css'
import { login } from './actions'
import RecoveryLinkNotice from './RecoveryLinkNotice'

type LoginPageProps = {
  searchParams: Promise<{
    error?: string
    recovery?: string
    next?: string
    notice?: string
  }>
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const { error, recovery, next, notice } = await searchParams

  return (
    <AuthShell title="Đăng nhập" description="Dùng email và mật khẩu đã được cấp cho tài khoản của bạn.">
      <RecoveryLinkNotice />
      {recovery === 'success' && (
        <p className={styles.success} role="status">
          Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới.
        </p>
      )}
      {notice && (
        <p className={styles.success} role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}
      <form action={login} className={styles.form}>
        <input type="hidden" name="next" value={next ?? ''}/>
        <label className={styles.field} htmlFor="email">
          <span>Email</span>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </label>
        <label className={styles.field} htmlFor="password">
          <span>Mật khẩu</span>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <div className={styles.assist}>
          <Link href="/forgot-password">Quên mật khẩu?</Link>
        </div>
        <button className={styles.submit} type="submit">
          Đăng nhập
        </button>
      </form>
      <p className={styles.secondary}>
        <Link href="/login/recover">Thiết lập hoặc đặt lại mật khẩu</Link>
      </p>
    </AuthShell>
  )
}
