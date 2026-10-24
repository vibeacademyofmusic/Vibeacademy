export const CANONICAL_PROGRAM_CODES = ['PIANO', 'GUITAR', 'VIOLIN', 'DRUMS'] as const

export type CanonicalProgramCode = (typeof CANONICAL_PROGRAM_CODES)[number]

export function isCanonicalProgramCode(code: string) {
  return (CANONICAL_PROGRAM_CODES as readonly string[]).includes(code)
}

export function isOperationalProgram(program: { code: string; status: string }) {
  return program.status === 'ACTIVE' && isCanonicalProgramCode(program.code)
}
