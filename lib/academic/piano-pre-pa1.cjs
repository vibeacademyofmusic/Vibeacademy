// Piano Adventures Level 1 Lesson Book, 2nd Edition — bibliographic map only.
// Piece titles and printed Lesson-column pages come from the book's Progress Chart
// (printed pp. 2–3). Instructional text is original teacher guidance, not score content.
const SUBJECT_NAME = 'Piano Adventures® Level 1 – Lesson Book'
const LEVEL_NAME = 'Pre Grade'
const SOURCE_BOOK = 'Piano Adventures® Level 1 – Lesson Book'
const EDITION = '2nd Edition'
const AUTHORS = 'Nancy and Randall Faber'

const UNITS = [
  ['PA1-FOUNDATION', 'FOUNDATION REVIEW'],
  ['PA1-U01', 'UNIT 1 — Legato and Staccato'],
  ['PA1-U02', 'UNIT 2 — Treble F-A-C-E'],
  ['PA1-U03', 'UNIT 3 — Treble C-D-E-F-G'],
  ['PA1-U04', 'UNIT 4 — Intervals (2nd, 3rd, 4th, 5th)'],
  ['PA1-U05', 'UNIT 5 — Half Rest and Whole Rest'],
  ['PA1-U06', 'UNIT 6 — Sharps and Flats'],
  ['PA1-U07', 'UNIT 7 — Tonic and Dominant'],
  ['PA1-U08', 'UNIT 8 — The C (I) Chord'],
  ['PA1-U09', 'UNIT 9 — The V7 Chord'],
  ['PA1-U10', 'UNIT 10 — G Five-Finger Scales'],
]

// [unit, title, printed Lesson page, observable skill, core concept]
const ROWS = [
  ['PA1-FOUNDATION', 'Get Ready for Take-off! (Primer Review)', '4', 'names the review notes, counts the printed rhythm values aloud, and plays the review lines at the marked dynamic', 'Primer note names, rhythm values, time signatures, and dynamic marks'],
  ['PA1-FOUNDATION', 'Head Start for Treble and Bass Clef Lines', '6', 'points to the named treble and bass staff lines and plays those line notes', 'Treble and bass clef line notes'],
  ['PA1-FOUNDATION', 'Firefly (Review piece)', '8', 'plays the review piece with the written rhythm and the printed dynamics', 'Review performance of reading, rhythm, and dynamics'],
  ['PA1-U01', 'Little River (Legato Steps)', '10', 'connects each legato step to the next note without a break', 'Legato connection'],
  ['PA1-U01', 'Sailing in the Sun', '11', 'plays each legato phrase in one connected motion', 'Legato phrases'],
  ['PA1-U01', 'Ferris Wheel', '12', 'keeps the legato touch while the pattern turns', 'Sustained legato'],
  ['PA1-U01', 'Mexican Jumping Beans', '14', 'plays the staccato notes short and separated', 'Staccato'],
  ['PA1-U01', 'The Haunted Mouse', '15', 'changes between legato and staccato at the written articulation', 'Legato and staccato contrast'],
  ['PA1-U01', 'Classic Dance', '16', 'keeps the dance pulse and the printed articulation', 'Articulation in a steady dance pulse'],
  ['PA1-U01', 'Young Hunter', '17', 'combines legato and staccato in one complete performance', 'Mixed articulation'],
  ['PA1-U02', 'Skipping in Space', '18', 'names and plays the treble F-A-C-E space notes written in the piece', 'Treble staff spaces F-A-C-E'],
  ['PA1-U02', 'Half-Time Show', '19', 'reads the treble space notes and plays them in the written rhythm', 'Treble F-A-C-E in rhythm'],
  ['PA1-U02', 'The Lonely Pine', '20', 'finds each written treble F, A, C, or E before playing it', 'Finding treble F-A-C-E'],
  ['PA1-U02', "Li'l Liza Jane", '21', 'performs the piece from the treble space notes on the page', 'Reading treble F-A-C-E in a piece'],
  ['PA1-U03', "C's Rock!", '22', 'names and plays the written treble notes C, D, E, F, and G', 'Treble C-D-E-F-G on the staff'],
  ['PA1-U03', "Mozart's Five Names", '23', 'plays the written treble notes C through G in order', 'Treble five-note reading'],
  ['PA1-U03', 'Paper Airplane', '24', 'reads C, D, E, F, and G and continues without stopping to hunt for each note', 'Fluent treble C-D-E-F-G'],
  ['PA1-U03', 'The Juggler', '25', 'names any missed C, D, E, F, or G and replays that measure correctly', 'Accurate treble C-D-E-F-G'],
  ['PA1-U04', 'Traffic Jam 2nds', '26', 'plays each written 2nd and shows that interval on the staff', 'Interval of a 2nd'],
  ['PA1-U04', 'This is Not Jingle Bells', '27', 'plays each printed 2nd or 3rd at the size written on the page', 'Intervals of a 2nd and 3rd'],
  ['PA1-U04', 'Kites in the Sky', '28', 'plays each printed interval at the size written on the page', 'Interval reading'],
  ['PA1-U04', 'A Mixed-Up Song', '30', 'names each printed 2nd, 3rd, 4th, or 5th before playing it', 'Intervals of a 2nd, 3rd, 4th, and 5th'],
  ['PA1-U04', 'Flute of the Andes', '32', 'keeps each written interval at its printed size', 'Interval size'],
  ['PA1-U04', 'Runaway Rabbit', '33', 'names the interval and then plays that distance', 'Naming intervals before playing'],
  ['PA1-U04', 'Rain Forest', '34', 'plays the written 2nds, 3rds, 4ths, and 5ths without changing their size', 'Accurate interval size'],
  ['PA1-U04', 'Lightly Row', '35', 'points to each 2nd, 3rd, 4th, or 5th in the piece and plays it', 'Intervals inside a piece'],
  ['PA1-U05', 'Forest Drums', '36', 'counts each half rest and whole rest for its full value before the next note', 'Half rest and whole rest'],
  ['PA1-U05', 'No Moon Tonight', '38', 'holds each written half rest or whole rest in silence for the full count', 'Full value of rests'],
  ['PA1-U05', 'Grumpy Old Troll', '39', 'performs the piece without shortening the written rests', 'Rests inside a piece'],
  ['PA1-U06', "Merlin's Wand", '40', 'names each printed sharp or flat and plays the altered note', 'Sharp and flat signs'],
  ['PA1-U06', 'Russian Sailor Dance', '41', 'applies each sharp or flat to the note that follows it', 'Reading sharps and flats'],
  ['PA1-U06', 'Super Secret Agent', '42', 'plays each altered note at the written pitch', 'Pitch of sharps and flats'],
  ['PA1-U06', 'Party Song', '43', 'names the sharp or flat in the measure and plays that note', 'Sharps and flats in context'],
  ['PA1-U06', 'Boogie on Broadway', '44', 'keeps each sharp or flat on the note where it is written', 'Applying sharps and flats'],
  ['PA1-U06', 'Scarf Dance', '45', 'performs the piece with the printed sharps and flats', 'Sharps and flats in performance'],
  ['PA1-U07', 'Two-Note March', '46', 'plays the tonic and dominant notes and names which one is sounding', 'Tonic and dominant'],
  ['PA1-U07', 'Girl on a Bicycle, Boy on a Bicycle', '47', 'moves between tonic and dominant at the written moments', 'Tonic and dominant changes'],
  ['PA1-U08', 'Blocked Chord Study, Broken Chord Study', '48', 'plays the C (I) chord both blocked and broken', 'C (I) chord, blocked and broken'],
  ['PA1-U08', 'Song for a Scarecrow', '49', 'plays the written C (I) chord in time', 'C (I) chord in a piece'],
  ['PA1-U08', 'My Pony', '50', 'keeps the notes of the C (I) chord together in rhythm', 'C (I) chord rhythm'],
  ['PA1-U08', 'Row, Row, Row Your Boat', '51', 'performs the piece with the written C (I) chord', 'C (I) chord performance'],
  ['PA1-U09', 'Theme from the "London" Symphony', '52', 'plays the V7 chord and resolves to I where written', 'V7 moving to I'],
  ['PA1-U09', 'Jazzy Joe', '53', 'changes between I and V7 at the written chord changes', 'I and V7 changes'],
  ['PA1-U09', "Shepherd's Song", '54', 'performs the piece using the written I and V7 chords', 'I and V7 in a piece'],
  ['PA1-U10', 'Bongo Drummers', '56', 'plays the written notes of the G five-finger scale', 'G five-finger notes'],
  ['PA1-U10', 'Warm-Up in G, Chords in G', '57', 'plays the G five-finger scale and the written G chords', 'G five-finger scale and chords'],
  ['PA1-U10', 'Dinosaur Stomp', '58', 'reads the G five-finger notes on the grand staff and plays them', 'G five-finger reading on the grand staff'],
  ['PA1-U10', 'The Dreydl Song', '59', 'stays inside the written G five-finger position', 'G five-finger position'],
  ['PA1-U10', 'The Bubble', '60', 'performs the piece in G five-finger position with the written rhythm', 'G five-finger repertoire'],
  ['PA1-U10', 'Adventure Scale and Chord Warm-Ups', '62, 64', 'plays the adventure scale, the chord warm-up, and one review piece from this book', 'Final review of the Lesson Book'],
]

function code(sort) {
  return `PIANO-PRE-PA1-L${String(sort).padStart(2, '0')}`
}

function guide(title, page, skill, concept, sort) {
  const ref = `${title} (Lesson Book p. ${page})`
  const final = sort === 50
  return {
    learning_objectives: `Student performs ${ref} and ${skill}. Student keeps a steady pulse and corrects a wrong note or rhythm before continuing.`,
    core_concepts: concept,
    teacher_demonstration: `Giáo viên thị phạm ${title}, trang ${page}: ${concept}. Học viên lắng nghe nhịp, nét câu và cường độ trước khi chơi.`,
    guided_practice: `Giáo viên và học viên chơi từng câu ngắn của ${title}. Giáo viên đếm nhịp. Học viên chỉ sang câu sau khi câu vừa rồi đúng nốt và đúng nhịp.`,
    independent_practice: `Học viên tự chơi ${title}, trang ${page}, chậm và đều. Phần luyện tập độc lập này không được ghi là hoàn thành học thuật.`,
    review: final
      ? 'Ôn lần lượt: đọc nhạc, nhịp, nét câu (legato/staccato), cường độ, dấu lặng, quãng 2-3-4-5, dấu thăng/giáng, thế năm ngón Sol, chủ âm/át âm, hợp âm I và V7, rồi một bài repertoire trong sách.'
      : `Ôn ngắn kỹ năng của bài ngay trước, rồi nối sang ${title}.`,
    checkpoint: final
      ? 'Điểm kiểm cuối: học viên chơi Adventure Scale and Chord Warm-Ups (trang 62) và một bài đã học. Giáo viên nghe đủ đọc nhạc, nhịp, legato/staccato, cường độ, dấu lặng, quãng, dấu thăng/giáng, thế năm ngón, chủ âm/át âm, I/V7 và phần biểu diễn. Ghi PASS chỉ sau điểm kiểm. Trang 64 là Certificate of Achievement trong sách, không phải lên Grade. Hoàn thành môn này không tự chuyển học viên lên Grade kế tiếp.'
      : `Điểm kiểm: học viên chơi hết ${title} với nhịp ổn định và đúng yêu cầu "${concept}". Giáo viên ghi PASS chỉ sau điểm kiểm, không ghi PASS chỉ vì học viên đã luyện tập.`,
    homework: `Về nhà chơi ${title} (trang ${page}) hai lần, chậm, đếm thành tiếng. Chưa chuyển bài khi còn sai nốt hoặc sai nhịp.`,
  }
}

function buildPlan() {
  if (ROWS.length !== 50) throw new Error('Piano Pre Grade requires exactly 50 lessons')
  const units = UNITS.map(([code, name], index) => ({ code, name, sort_order: index + 1 }))
  const lessons = ROWS.map(([unit, title, sourcePages, skill, concept], index) => {
    const sort = index + 1
    const body = guide(title, sourcePages, skill, concept, sort)
    return {
      lesson_code: code(sort),
      title,
      unit,
      source_book: SOURCE_BOOK,
      source_edition: EDITION,
      source_authors: AUTHORS,
      source_pages: sourcePages,
      piece_reference: title,
      sort_order: sort,
      ...body,
    }
  })
  return {
    subject_name: SUBJECT_NAME,
    previous_subject_name: 'Methode Book',
    level_name: LEVEL_NAME,
    source_book: SOURCE_BOOK,
    source_edition: EDITION,
    source_authors: AUTHORS,
    units,
    lessons,
  }
}

module.exports = { SUBJECT_NAME, LEVEL_NAME, SOURCE_BOOK, EDITION, AUTHORS, UNITS, buildPlan }
