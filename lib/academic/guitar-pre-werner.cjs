// Approved Guitar Pre Grade operator map.
// Titles and part boundaries come from the Werner volume lists.
// Printed page numbers are not invented.

const VOLUME_1_NAME = 'Classical Guitar Method – Volume 1'
const VOLUME_2_NAME = 'Classical Guitar Method – Volume 2'
const VOLUME_1_TITLES = [
  'Getting Started: Finger Names & Guitar Anatomy',
  'Hand and Sitting Positions for Classical Guitar',
  'Brief Definitions of Music Notation',
  'Notes & Rhythms',
  'Three Open Strings',
  'Rhythms for Etude No. 1',
  'Etude No. 1 – Melody',
  'Etude No. 2 – Arpeggios',
  'Nocturne Duet',
  'Notes on the Third String',
  'Sight Reading & Review: Third String',
  'Moderato',
  'A Fairy Tale',
  'Notes on the First & Second Strings',
  'Note Review & Sight Reading',
  'Five Melodies',
  'Ode to Joy',
  'Sight Reading & Dynamics',
  'Etude No. 3 – Sound Picture',
  'Twinkle, Twinkle, Little Star',
  'Etude No. 4 – The Birds',
  'Jazz Cat',
  'Au clair de la lune',
  'Oh! Susanna',
  'Waltz – Carl Czerny',
  'Minuet – C. H. Wilton',
  'Morning – Anton Diabelli',
  'Open Bass Strings',
  'Etude No. 5 – Waltz',
  'Etude No. 6 – Allegro',
  'Etude No. 7 – The Lonely Dogwood',
  'New Notes: C, D, E, F',
  'Note Review & Etude No. 8 – Prelude',
  'C Major Scale',
  'Eighth Notes',
  'Sight Reading with Eighth Notes',
  'Angeline the Baker',
  'Minuet – James Hook',
  'Etude No. 9 – Glass',
  'Vsi so venci vejli',
  'Flow Gently, Sweet Afton',
  'Two Voice Textures',
  'Etude No. 10 – The Swan',
  'Etude No. 11 – The Old Douglas Fir',
  'Dotted Quarter Notes',
  'Little Birch Tree in the Field',
  'The Skye Boat Song',
  'Fifth & Sixth String Notes / Note Review',
  'Accidentals, Chromatic Scale & Leyenda Theme',
  'Final Volume 1 Repertoire & Technique Review',
]
const VOLUME_2_TITLES = [
  'C Major: Scale, Arpeggio, Triads & Chord Progression',
  'Menuet en Rondeau – Jean-Philippe Rameau',
  'Vals, Op. 241, No. 1 – Ferdinando Carulli',
  'Morning Has Broken',
  'A Melodic Minor: Scale, Arpeggio, Triads & Chords',
  'Romance No. 14, Op. 168 – Joseph Küffner',
  'Lección No. 46 – Julio Sagreras',
  'Star of County Down',
  'G Major: Scale, Arpeggio, Triads & Chords',
  'Minuet – J. S. Bach',
  'Kean O\'Hara – Turlough O\'Carolan',
  'E Melodic Minor: Scale, Arpeggio, Triads & Chords',
  'Erster Verlust No. 16, Op. 68 – Robert Schumann',
  'Prelude in E Minor',
  'D Major: Scale, Arpeggio, Triads & Chords',
  'Le Petit Rien – François Couperin',
  'La Volte',
  'A Major: Scale, Arpeggio, Triads & Chords',
  'Menuet in A, HWV 545 – G. F. Handel',
  'Lección No. 54 – Julio Sagreras',
  'Bound for South Australia',
  'F Major: Scale, Arpeggio, Triads & Chords',
  'Melody by Mertz',
  'D Melodic Minor: Scale, Arpeggio, Triads & Chords',
  'Riguadon – Jean-Philippe Rameau',
  'Lección No. 55 – Julio Sagreras',
  'Single String Chromatic Scales',
  'Introduction to 3rd & 5th Position',
  'Ode to Joy in 1st, 3rd & 5th Position',
  'Position Exercises No. 1–5',
  'To the Highest Note in Position / Twinkle Twinkle Little Star',
  'Position Exercises No. 6–10',
  'Joy to the World',
  'El Noi de la Mare',
  'Position Shifts',
  'The Canaries or the Hay',
  'Feng Yang Flower Drum',
  'Captain O\'Kane',
  'Tips for Counting Rhythms',
  'Rhythm Exercises No. 1–10',
  'Rhythm Exercises No. 11–20',
  'Rhythm Exercises No. 21–30',
  'Rhythm Exercises No. 31–40',
  'Rhythm Exercises No. 41–50',
  'Rhythm Exercises No. 51–60',
  'Right-Hand Alternation & Open-String Exercises',
  'Basic Arpeggio Patterns with p, i, m, a',
  'Two-Voice Patterns & Awkward String Crossings',
  'Left-Hand Exercises & Moveable Scale Patterns',
  'Barre, Position Playing & Volume 2 Review',
]

function code(number) {
  return `L${String(number).padStart(2, '0')}`
}

function volume1Section(number) {
  if (number < 50) return 'Part 1 — Progressive Method'
  return 'Part 1 close, with Part 2 chord and fingerstyle exposure and Part 3 technique review'
}

function volume2Section(number) {
  if (number <= 27) return 'Part 1 — Reading Music & Chords in Common Keys'
  if (number <= 38) return 'Part 2 — Introduction to 3rd & 5th Position'
  if (number <= 45) return 'Part 3 — Rhythm Training'
  return 'Part 4 — Technique & Warm-up Exercises'
}

function lessons(titles, section) {
  return titles.map((title, index) => {
    const number = index + 1
    return {
      code: code(number),
      title,
      number,
      section: section(number),
    }
  })
}

function buildPlan() {
  const volume1 = lessons(VOLUME_1_TITLES, volume1Section)
  const volume2 = lessons(VOLUME_2_TITLES, volume2Section)
  if (volume1.length !== 50 || volume2.length !== 50) throw new Error('Guitar Pre Werner map must contain 50 lessons in each volume')
  return {
    level_name: 'Pre Grade',
    previous_level_name: 'Pre',
    volume1_name: VOLUME_1_NAME,
    volume1_previous_name: 'Methode Book',
    volume1_subject_code: 'METHODE_BOOK',
    volume1_source: {
      title: 'Classical Guitar Method – Volume 1',
      edition: '2020 Edition',
      author: 'Bradford Werner',
    },
    volume2_name: VOLUME_2_NAME,
    volume2_previous_names: ['Repertoire Pre', 'Repertoire'],
    volume2_subject_code: 'REPERTOIRE',
    volume2_source: {
      title: 'Classical Guitar Method – Volume 2',
      edition: '2019 Edition',
      author: 'Bradford Werner',
    },
    volume1,
    volume2,
  }
}

function buildMapMarkdown() {
  const plan = buildPlan()
  const rows = (volume, previous) => volume.map(lesson => {
    const prior = lesson.number <= 10 && previous ? `Lesson ${code(lesson.number).slice(1)}` : ''
    const action = previous && lesson.number <= 10 ? 'RENAME' : 'CREATE'
    return `| ${lesson.code} | ${lesson.title} | ${lesson.section} | ${action} | ${prior || '—'} |`
  }).join('\n')
  return `# Guitar Pre Grade — Werner method map v1

Source of truth:

- Classical Guitar Method – Volume 1, Bradford Werner, 2020 Edition
- Classical Guitar Method – Volume 2, Bradford Werner, 2019 Edition

This file records titles and structural placement only. It does not reproduce sheet music or book text. The lesson table has no source_book, source_section, source_page_start, or source_page_end columns, so printed page numbers are not stored and are not invented here.

## Subject mapping

| Role | Subject code | Previous name | Name |
| --- | --- | --- | --- |
| Method | METHODE_BOOK | Methode Book | ${plan.volume1_name} |
| Repertoire | REPERTOIRE | Repertoire Pre | ${plan.volume2_name} |

Guitar level code PRE is labeled ${plan.level_name}. Technique Foundation, Aural, and Sight Reading stay on their own subjects. Guitar Grade 1–8 are outside this map.

Each subject keeps a single Core component. Volume 1 had no component, so one Core group is added for its lessons. Lessons are not moved between components.

The 50-lesson list is the VIBE scheduling order. Volume 1 stays one subject: Part 1 is progressive, Part 3 technique is studied alongside that sequence, and Part 2 chord and fingerstyle material stays supplementary. Those parts are not separate subjects. Volume 1 lesson L50 is the final scheduling unit for the late Volume 1 progression, including Greensleeves, Malagueñas, Minuet in G, Siciliano, Farewell, chord and fingerstyle exposure, and the right-hand and left-hand technique review.

Volume 2 follows the book parts below. Appendix material may support L50 and does not add another lesson.

## Volume 1

| Code | Lesson | Source section | Reconciliation | Previous placeholder |
| --- | --- | --- | --- | --- |
${rows(plan.volume1, false)}

## Volume 2

| Code | Lesson | Source section | Reconciliation | Previous placeholder |
| --- | --- | --- | --- | --- |
${rows(plan.volume2, true)}

## Historical safety

The ten Volume 2 placeholders Lesson 01–Lesson 10 already occupy codes L01–L10. Where a student progress row points at one of those items, the same item id is kept and the title is updated. That is safe for the current rows because they are NOT_STARTED numbered slots, not a different completed piece. The code is not changed, so the unique lesson code is not taken from a historical row.

No lesson row is deleted. Nothing is retired, because retiring L01–L10 would require renaming those codes before the Werner lessons could use them. New lessons are L11–L50 on Volume 2 and L01–L50 on Volume 1.

A second apply finds the target titles already stored and leaves the item ids in place.
`
}

module.exports = {
  VOLUME_1_NAME,
  VOLUME_2_NAME,
  buildPlan,
  buildMapMarkdown,
}
