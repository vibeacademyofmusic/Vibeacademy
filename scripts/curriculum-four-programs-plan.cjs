// Authoring manifest only. Database parent/component mappings must be resolved
// against the live local tree before any writer consumes this plan.
const PROGRAMS = ['Piano', 'Drums', 'Guitar', 'Violin']
const FOUNDATION = ['Methode Book', 'Technique Foundation', 'Aural', 'Sight Reading']
const GRADE = ['Repertoire', 'Technique Foundation', 'Aural', 'Sight Reading']

function buildPlan() {
  return PROGRAMS.map(name => ({
    code: name.toUpperCase(),
    name,
    levels: [
      ...(name === 'Piano' ? [{ code: 'PRE_STEP', name: 'Pre Step', grade: null }] : []),
      { code: 'PRE', name: 'Pre', grade: null },
      ...Array.from({ length: 8 }, (_, i) => ({ code: `G${i + 1}`, name: `Grade ${i + 1}`, grade: i + 1 })),
    ].map((level, index) => ({
      ...level,
      sequence: index + 1,
      levelType: level.grade === null ? 'FOUNDATION' : 'GRADE',
      subjects: [
        ...(level.grade === null ? FOUNDATION : GRADE),
        ...(level.grade >= 4 ? ['Ensemble'] : []),
        ...(level.grade >= 7 ? ['Music History', 'Media Product'] : []),
      ].map(subject => ({
        name: subject,
        componentMapping: null,
        lessons: Array.from({ length: level.grade === null ? 50 : 10 }, (_, i) => ({
          key: `${name.toUpperCase()}/${level.code}/${subject}/${i + 1}`,
          code: `L${String(i + 1).padStart(2, '0')}`,
          name: `Lesson ${String(i + 1).padStart(2, '0')}`,
          ordinal: i + 1,
        })),
      })),
    })),
  }))
}

function counts(plan) {
  return plan.map(program => ({
    program: program.name,
    levels: program.levels.length,
    subjects: program.levels.reduce((n, level) => n + level.subjects.length, 0),
    lessons: program.levels.reduce((n, level) => n + level.subjects.reduce((sum, subject) => sum + subject.lessons.length, 0), 0),
  }))
}

module.exports = { buildPlan, counts }
if (require.main === module) {
  if (process.argv.length > 3 || !['--manifest', '--counts', undefined].includes(process.argv[2])) {
    throw new Error('Usage: node scripts/curriculum-four-programs-plan.cjs [--manifest|--counts] (no database writes)')
  }
  console.log(JSON.stringify(process.argv[2] === '--manifest' ? buildPlan() : counts(buildPlan()), null, 2))
}
