import Link from 'next/link'

export function AcademicTrail({ items }: { items: { label: string; href?: string }[] }) {
  const trail = [{ label: 'Chương trình và khóa học', href: '/admin/programs' }, ...items]
  return (
    <nav aria-label="Đường dẫn chương trình" className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
      {trail.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
          {index > 0 && <span aria-hidden="true">→</span>}
          {item.href && index < trail.length - 1
            ? <Link href={item.href} className="hover:text-gray-900">{item.label}</Link>
            : <span className="font-medium text-gray-800">{item.label}</span>}
        </span>
      ))}
    </nav>
  )
}
