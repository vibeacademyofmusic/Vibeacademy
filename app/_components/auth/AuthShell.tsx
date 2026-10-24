import type { ReactNode } from 'react'
import styles from './auth-shell.module.css'

export default function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className={styles.page}>
    <section className={styles.panel} aria-labelledby="auth-title">
      <div className={styles.brand}>
        <div className={styles.stage}>
          <div className={styles.logoFrame}>
            <img className={styles.logo} src="/vibe-logo.png" alt="Vibe Academy of Music & Cinema" width={3543} height={2362} />
          </div>
          <p className={styles.motto}>
            <span className={styles.kicker}>Hơn</span>
            <span className={styles.years}><b>10</b> năm</span>
            <span className={styles.line}>sự nghiệp</span>
            <span className={styles.line}>giáo dục âm nhạc</span>
          </p>
        </div>
      </div>
      <div className={styles.body}>
        <header>
          <p className={styles.eyebrow}>Hệ thống quản lý</p>
          <h1 id="auth-title">{title}</h1>
          {description ? <p className={styles.description}>{description}</p> : null}
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </section>
  </main>
}
