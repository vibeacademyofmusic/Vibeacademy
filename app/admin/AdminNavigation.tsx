'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { activeNavigationHref, activeNavigationParent, navigationForAccess, type ShellMode } from './navigation'

export default function AdminNavigation({ mobile = false, mode = 'full', hiddenHrefs = [] }: { mobile?: boolean, mode?: ShellMode, hiddenHrefs?: string[] }) {
  const pathname = usePathname() || ''
  return <Navigation key={pathname} pathname={pathname} mobile={mobile} mode={mode} hiddenHrefs={hiddenHrefs} />
}

function Navigation({ pathname, mobile, mode, hiddenHrefs }: { pathname: string; mobile: boolean; mode: ShellMode; hiddenHrefs: string[] }) {
  const active = activeNavigationHref(pathname)
  const parent = activeNavigationParent(pathname)
  const hidden = new Set(hiddenHrefs)
  const groups = <div className={mobile ? 'grid gap-5 pt-4 sm:grid-cols-2' : 'space-y-5'}>
    {navigationForAccess(mode).map(group => <section key={group.name} aria-label={group.name}>
      {!(group.items.length === 1 && group.items[0].name.toLocaleUpperCase('vi') === group.name) && <h2 className="mb-1 px-3 text-xs font-semibold tracking-wide text-gray-500">{group.name}</h2>}
      <ul className="space-y-1">{group.items.filter(item => !hidden.has(item.href)).map(item => {
        const itemActive = item.children?.length ? parent === item.href : active === item.href
        return <li key={item.href}>
          <div className="flex items-center gap-1">
          <Link href={item.href} prefetch={false} aria-current={itemActive ? item.children?.length ? 'location' : 'page' : undefined}
            className={`block min-w-0 flex-1 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vibe-gold)] ${itemActive ? 'vibe-nav-active' : 'text-gray-700 hover:bg-gray-100'}`}>
            {item.name}
          </Link>
          </div>
          {item.children?.length && !item.hideChildren ? <ul className="mt-1 space-y-1 border-l border-gray-200 ml-3 pl-1">{item.children.map(child => <li key={child.href}>
            <Link href={child.href} prefetch={false} aria-current={active === child.href ? 'page' : undefined}
              className={`block rounded-lg px-3 py-1.5 text-sm ${active === child.href ? 'vibe-nav-active' : 'text-gray-600 hover:bg-gray-100'}`}>
              {child.name}
            </Link>
          </li>)}</ul> : null}
        </li>
      })}</ul>
    </section>)}
  </div>
  return mobile
    ? <nav aria-label="Điều hướng quản trị mobile" className="border-b border-gray-200 bg-white px-4 py-3 lg:hidden"><details><summary className="cursor-pointer font-medium">Menu quản trị</summary>{groups}</details></nav>
    : <nav aria-label="Điều hướng quản trị" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5">{groups}</nav>
}
