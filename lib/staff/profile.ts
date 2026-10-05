export const PORTRAIT_MIN = 400
export const PORTRAIT_MAX = 4000
export const PORTRAIT_MAX_BYTES = 2_000_000

export type PortraitMime = 'image/jpeg' | 'image/png' | 'image/webp'
export type PortraitInspection =
  | { ok: true; mime: PortraitMime; ext: 'jpg' | 'png' | 'webp'; width: number; height: number }
  | { ok: false; message: string }

const POSITION_CODES = ['VAS', 'VAM', 'VAH'] as const

export type PublicCard = {
  fullName: string
  employeeCode: string
  teachingBadges: string[]
  positionBadges: string[]
  branchName: string | null
}

export function vietnamToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function teachingBadgeLabel(capacity: string, subjectName: string) {
  const role = capacity === 'TEACHER' ? 'Giáo viên' : capacity === 'ASSISTANT' ? 'Trợ giảng' : ''
  const subject = subjectName.trim()
  if (!role || !subject) return null
  return `${role} ${subject}`
}

export function positionBadgeLabel(code: string) {
  return POSITION_CODES.includes(code as (typeof POSITION_CODES)[number]) ? code : null
}

export function isCurrentAssignment(
  row: { status: string; effectiveFrom: string; effectiveTo: string | null },
  today: string,
) {
  if (row.status !== 'ACTIVE') return false
  if (row.effectiveFrom > today) return false
  if (row.effectiveTo && row.effectiveTo < today) return false
  return true
}

export function publicCard(input: {
  fullName: string
  employeeCode: string
  teaching: { capacity: string; subjectName: string; status: string; effectiveFrom: string; effectiveTo: string | null }[]
  positions: { code: string; status: string; effectiveFrom: string; effectiveTo: string | null }[]
  branchName?: string | null
  today: string
}): PublicCard {
  const teachingBadges = unique(input.teaching.flatMap(row => {
    if (!isCurrentAssignment(row, input.today)) return []
    const label = teachingBadgeLabel(row.capacity, row.subjectName)
    return label ? [label] : []
  }))
  const positionBadges = unique(input.positions.flatMap(row => {
    if (!isCurrentAssignment(row, input.today)) return []
    const label = positionBadgeLabel(row.code)
    return label ? [label] : []
  }))
  return {
    fullName: input.fullName.trim(),
    employeeCode: input.employeeCode.trim(),
    teachingBadges,
    positionBadges,
    branchName: input.branchName?.trim() || null,
  }
}

export function cardInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const letters = `${parts[0]?.[0] || ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`
  return letters.toLocaleUpperCase('vi-VN') || 'VA'
}

export function inspectPortrait(bytes: Uint8Array, declaredType: string): PortraitInspection {
  if (bytes.byteLength === 0) return { ok: false, message: 'Hãy chọn một ảnh chân dung.' }
  if (bytes.byteLength > PORTRAIT_MAX_BYTES) return { ok: false, message: 'Ảnh chân dung vượt quá 2 MB.' }
  const sniffed = sniffPortrait(bytes)
  if (!sniffed) return { ok: false, message: 'Ảnh chân dung phải là JPG, PNG hoặc WEBP.' }
  const declared = declaredType.toLowerCase().split(';')[0].trim()
  if (declared && declared !== 'application/octet-stream' && declared !== sniffed.mime) {
    return { ok: false, message: 'Định dạng tệp không khớp với nội dung ảnh.' }
  }
  if (
    sniffed.width < PORTRAIT_MIN || sniffed.height < PORTRAIT_MIN
    || sniffed.width > PORTRAIT_MAX || sniffed.height > PORTRAIT_MAX
  ) {
    return { ok: false, message: 'Ảnh chân dung cần từ 400 đến 4000 điểm ảnh mỗi cạnh.' }
  }
  return { ok: true, ...sniffed }
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function sniffPortrait(bytes: Uint8Array): { mime: PortraitMime; ext: 'jpg' | 'png' | 'webp'; width: number; height: number } | null {
  return pngSize(bytes) || jpegSize(bytes) || webpSize(bytes)
}

function pngSize(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 24 || signature.some((byte, index) => bytes[index] !== byte)) return null
  return {
    mime: 'image/png' as const,
    ext: 'png' as const,
    width: readU32(bytes, 16),
    height: readU32(bytes, 20),
  }
}

function jpegSize(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2
      continue
    }
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3]
    if (length < 2 || offset + 2 + length > bytes.length) return null
    if (marker >= 0xc0 && marker <= 0xc2) {
      return {
        mime: 'image/jpeg' as const,
        ext: 'jpg' as const,
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      }
    }
    offset += 2 + length
  }
  return null
}

function webpSize(bytes: Uint8Array) {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null
  const chunk = ascii(bytes, 12, 4)
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return { mime: 'image/webp' as const, ext: 'webp' as const, width: u16(bytes, 26) & 0x3fff, height: u16(bytes, 28) & 0x3fff }
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f && bytes.length >= 25) {
    const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24]
    return {
      mime: 'image/webp' as const,
      ext: 'webp' as const,
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    }
  }
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return {
      mime: 'image/webp' as const,
      ext: 'webp' as const,
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    }
  }
  return null
}

function readU32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

function u16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length))
}
