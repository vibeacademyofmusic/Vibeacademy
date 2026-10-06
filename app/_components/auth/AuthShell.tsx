import type { ReactNode } from 'react'

export default function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="vibe-admin flex min-h-screen items-center justify-center px-4 py-10">
    <section className="vibe-card w-full max-w-md !p-6 sm:!p-8" aria-labelledby="auth-title">
      <header className="mb-7 text-center">
        <p className="vibe-eyebrow mb-3">VIBE Academy</p>
        <h1 id="auth-title" className="!text-2xl">{title}</h1>
        <p className="mt-3 text-sm text-[var(--vibe-muted)]">{description}</p>
      </header>
      {children}
      <p className="!mt-8 text-center text-xs text-[var(--vibe-muted)]">Vibe Academy of Music &amp; Cinema</p>
    </section>
  </main>
}
