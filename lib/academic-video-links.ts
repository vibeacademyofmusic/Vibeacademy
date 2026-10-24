export type AcademicVideoLink = {
  id: string
  title: string
  url: string
  note: string | null
  level_id: string | null
  item_id: string | null
  level_name: string | null
  lesson_name: string | null
  shared_with_family: boolean
  version: number
}

export type VideoLinkContext = {
  can_manage: boolean
  links: AcademicVideoLink[]
  levels: { id: string; name: string }[]
  lessons: { id: string; level_id: string; name: string }[]
}

export type VideoLinkResult = { ok: boolean; message: string }

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Store a video address, never an arbitrary redirect, embed HTML or tracking URL.
// Normalization does not check the video's existence, visibility or viewer grants.
export function normalizeYouTubeLink(value: string): string | null {
  const input = value.trim()
  if (!input || input.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(input)) return null
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    let id: string | null = null
    if (url.hostname === 'youtu.be') {
      id = /^\/([\w-]{11})\/?$/.exec(url.pathname)?.[1] ?? null
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      id = url.pathname === '/watch'
        ? (url.searchParams.getAll('v').length === 1 ? url.searchParams.get('v') : null)
        : /^\/(?:shorts|embed|live)\/([\w-]{11})\/?$/.exec(url.pathname)?.[1] ?? null
    }
    return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null
  } catch {
    return null
  }
}
