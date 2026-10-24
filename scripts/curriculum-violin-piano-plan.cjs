// Owner request 2026-10-05: 10 lesson slots per subject for Violin Pre–G8
// and Piano Pre Step/Pre. The historical four-program manifest stays unchanged.
const { buildPlan: historicalPlan, counts } = require('./curriculum-four-programs-plan.cjs')

function buildPlan() {
  return historicalPlan().filter(p => ['VIOLIN', 'PIANO'].includes(p.code)).map(program => ({
    code: program.code,
    name: program.name,
    levels: program.levels.filter(l => program.code === 'VIOLIN' || l.grade === null).map(level => ({
      ...level,
      rank: level.code === 'PRE_STEP' ? -1 : level.grade ?? 0,
      subjects: level.subjects.map(subject => ({
        code: subject.name.toUpperCase().replaceAll(' ', '_'),
        name: subject.name,
        family: subject.name === 'Technique Foundation' ? 'TECHNIQUE'
          : subject.name === 'Sight Reading' ? 'SIGHTREADING'
            : subject.name.toUpperCase().replaceAll(' ', '_'),
        lessons: subject.lessons.slice(0, 10),
      })),
    })),
  }))
}

module.exports = { buildPlan, counts }
if (require.main === module) console.log(JSON.stringify({ counts: counts(buildPlan()), programs: buildPlan() }, null, 2))
