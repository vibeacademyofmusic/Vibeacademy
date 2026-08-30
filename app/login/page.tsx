import { login } from './actions'

type LoginPageProps = {
  searchParams: Promise<{
    error?: string
  }>
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Vibe Academy
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Management System
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form action={login} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-gray-900"
              placeholder="admin@vibeacademy..."
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-gray-900"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-gray-900 px-4 py-3 font-medium text-white hover:bg-gray-800"
          >
            Sign in
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-gray-400">
          Vibe Academy of Music & Cinema
        </p>
      </div>
    </main>
  )
}