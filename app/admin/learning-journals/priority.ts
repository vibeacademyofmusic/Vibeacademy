export const lessonContexts = [
  ['TECHNIQUE', 'Kỹ thuật'],
  ['SIGHTREADING', 'Đọc nhạc'],
  ['REPERTOIRE', 'Tác phẩm'],
  ['THEORY', 'Lý thuyết'],
] as const

const priority: Record<string, string[]> = {
  TECHNIQUE: ['TECHNIQUE', 'ACCURACY', 'RHYTHM'],
  SIGHTREADING: ['READING', 'RHYTHM', 'ACCURACY', 'INDEPENDENCE'],
  REPERTOIRE: ['TECHNIQUE', 'MUSICALITY', 'ACCURACY', 'RHYTHM'],
  THEORY: [],
}

export type ObservationOption = {
  code: string
  dimension: string
  signal: 'STRENGTH' | 'DEVELOPMENT'
  label_vi: string
  draft_clause_vi: string
  sort_order: number
  active: boolean
}

export function recommendedOptions(options: ObservationOption[], context: string) {
  const dimensions = priority[context] ?? []
  const ranked = options.filter(option => option.active && dimensions.includes(option.dimension))
    .sort((a, b) => dimensions.indexOf(a.dimension) - dimensions.indexOf(b.dimension) || a.sort_order - b.sort_order)
  return {
    strength: ranked.filter(option => option.signal === 'STRENGTH').slice(0, 4),
    development: ranked.filter(option => option.signal === 'DEVELOPMENT').slice(0, 4),
  }
}

export function draftProgressNote(options: ObservationOption[], codes: string[]) {
  const selected = options.filter(option => codes.includes(option.code))
  const strength = selected.filter(option => option.signal === 'STRENGTH').sort((a, b) => a.sort_order - b.sort_order).map(option => option.draft_clause_vi)
  const development = selected.filter(option => option.signal === 'DEVELOPMENT').sort((a, b) => a.sort_order - b.sort_order).map(option => option.draft_clause_vi)
  return [strength.length ? `Em ${strength.join(' và ')}.` : '', development.length ? `${development.join('. ')}.` : ''].filter(Boolean).join(' ')
}

export function draftHomework(parts: { code: string; part_group: string; label_vi: string; sort_order: number }[], codes: string[]) {
  const order = ['CONTENT', 'METHOD', 'DURATION', 'FREQUENCY']
  return parts.filter(part => codes.includes(part.code))
    .sort((a, b) => order.indexOf(a.part_group) - order.indexOf(b.part_group) || a.sort_order - b.sort_order)
    .map(part => part.label_vi).join(' · ')
}
