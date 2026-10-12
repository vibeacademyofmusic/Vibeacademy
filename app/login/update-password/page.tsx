import Link from 'next/link'
import AuthShell from '@/app/_components/auth/AuthShell'
import styles from '@/app/_components/auth/auth-shell.module.css'
import { UpdatePasswordForm } from './form'

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <AuthShell title="Đặt mật khẩu mới" description="Nhập mật khẩu mới cho tài khoản. Mật khẩu này dùng để đăng nhập.">
      {error ? <p className={styles.alert} role="alert">{error}</p> : null}
      <UpdatePasswordForm />
      <p className={styles.secondary}><Link href="/login">Quay lại đăng nhập</Link></p>
    </AuthShell>
  )
}
