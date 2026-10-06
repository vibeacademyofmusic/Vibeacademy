/* eslint-disable @typescript-eslint/no-require-imports */
const map = require('./violin-pre-step-map.json')

function pageSpan(pages) {
  if (!Array.isArray(pages) || pages.length < 1) throw new Error('missing pages')
  const sorted = [...pages].map(Number).sort((a, b) => a - b)
  if (sorted.some(page => !Number.isInteger(page) || page < 1)) throw new Error('invalid page')
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] !== sorted[0] + index) throw new Error(`noncontiguous pages ${sorted.join(',')}`)
  }
  return sorted.length === 1 ? String(sorted[0]) : `${sorted[0]}-${sorted[sorted.length - 1]}`
}

function partNote(part) {
  const notes = {
    BOOK_DUET: 'Sách 1 bắt đầu bằng bè có dấu sao. Học viên chơi bè đó trước; giáo viên giữ bè còn lại. Chưa yêu cầu thuộc cả hai bè trong lần đầu.',
    UPPER_STAFF: 'Hai bè trong sách 2 ngang độ khó. Lượt này chỉ khuông trên. Không gán khuông dưới mặc định cho giáo viên.',
    LOWER_STAFF_AND_ENSEMBLE: 'Lượt này học khuông dưới rồi ghép hoà tấu và đổi vai. Khuông dưới không phải bè chỉ dành cho giáo viên.',
    PRINTED_BARS_9_24: 'Bản in bắt đầu ở ô nhịp 9 sau 8 ô đếm. Không viết thêm ô nhịp 1–8.',
    PRINTED_BARS_25_40_AND_FORM: 'Nối từ ô 25, trở lại dấu Segno và kết tại Fine. Đây vẫn là cùng bài 9, không phải một bài mới.',
    PRINTED_BARS_1_34: 'Chỉ đoạn arco đến hết ô 34, trước chỉ dẫn pizzicato.',
    PRINTED_BAR_35_TO_END_AND_INTEGRATION: 'Từ ô 35 đổi sang pizzicato, trở lại arco, rồi nối cả bài khi đoạn này còn giữ được nhịp.',
    PRINTED_BARS_1_22: 'Ô 1–22: luyện từng chỗ đổi pizzicato và arco. Chưa sang pizzicato tay trái.',
    PRINTED_BAR_23_TO_END_AND_INTEGRATION: 'Từ ô 23 đến hết, có pizzicato tay trái. Giáo viên làm mẫu; giữ tư thế thoải mái, không ép ngón. Sau đó mới nối cả bài.',
  }
  return notes[part] || ''
}

function teach(book, lesson) {
  const printed = pageSpan(lesson.printed_pages)
  const pdf = pageSpan(lesson.pdf_pages)
  const piece = lesson.source_piece_number ? `bài số ${lesson.source_piece_number}` : 'không phải một bài nhạc đánh số'
  const extra = partNote(lesson.part)
  const opener = lesson.lesson_code === 'L01' && book.subject_code === 'FT_JOGGERS_B1'
    ? 'Cỡ đàn, tư thế, cách cầm và lên dây là phần giáo viên chuẩn bị trước; sách này không trình bày đủ các phần đó.'
    : lesson.lesson_code === 'L01' && book.subject_code === 'FT_RUNNERS_B2'
      ? 'Sách 2 đứng sau sách 1 về trình tự sư phạm. Đây không phải khóa bắt đầu song song, không phải điều kiện thi và không tương đương một cấp ABRSM.'
      : ''
  const review = lesson.lesson_kind === 'REFERENCE_REVIEW'
    ? 'Dùng trang này để tìm ví dụ trong các bài đã học. Không dùng như Final Test, không chấm điểm và không tự hoàn thành môn.'
    : ''
  return {
    source_pdf_pages: pdf,
    source_printed_pages: printed,
    content_scope: `${piece}. ${lesson.source_scope}`,
    learning_objectives: `Học viên thực hiện được phạm vi đã chọn của “${lesson.title}”: ${lesson.teaching_focus_vi}`,
    classroom_activities: [
      `Chuẩn bị: mở ${book.subject_name}, mục ${lesson.source_section_title}, trang in ${printed} (PDF ${pdf}). Xác nhận đúng “${lesson.title}”.`,
      `Đọc và nghe: giáo viên thị phạm đúng phạm vi “${lesson.source_scope}”. Học viên gọi tên nốt hoặc ký hiệu vừa nghe trước khi kéo vĩ.`,
      `Chơi có hướng dẫn: luyện riêng phạm vi này (${piece}). Giữ tốc độ mà học viên còn kiểm soát được; không lấy số Practice tempo làm tốc độ bắt buộc.`,
      `Sửa trọng tâm: ${lesson.teaching_focus_vi}`,
      `Ghép phạm vi: chơi lại trọn phạm vi của Lesson ${lesson.lesson_code}. Một Lesson có thể cần nhiều buổi.`,
    ].join('\n'),
    homework: `Ôn “${lesson.title}”, chỉ phạm vi “${lesson.source_scope}”, trang in ${printed}. Khi chỗ vừa sửa còn ổn định, chơi lại trọn phạm vi đó. Không giao thời lượng cố định, tốc độ hay điểm số.`,
    teacher_notes: [
      'Giáo án tiếng Việt do VIBE biên soạn từ phạm vi đã đối chiếu; không chép nguyên bản nhạc.',
      opener,
      extra,
      review,
      `Quan sát riêng bài này: ${lesson.teaching_focus_vi}`,
      `Nguồn: ${book.source_filename}; ISBN ${book.isbn}; SHA-256 ${book.source_sha256}.`,
    ].filter(Boolean).join(' '),
    source_context: lesson.lesson_code === 'L01' ? [
      `${book.subject_name}. ${book.authors.join(', ')}. ${book.publisher}. ${book.edition_label}. ISBN ${book.isbn}.`,
      `Tệp nguồn ${book.source_filename}, SHA-256 ${book.source_sha256}, ${book.pdf_page_count} trang PDF. Không đưa PDF vào Git.`,
      'Trang in 3–16 thường là PDF 4–17. PDF 18–21 là trang quảng cáo, không dạy. Trang in 17–32 thường là PDF 22–37.',
      book.subject_code === 'FT_JOGGERS_B1'
        ? 'Ngoại lệ sách 1: trang in 23 là PDF 29; trang in 24 là PDF 28. Dạy bài 33 Listen to the rhythm trước bài 34 và 35.'
        : 'Ten thousand miles away trải trang in 18–19, PDF 23–24. Sáu song tấu được tách khuông trên rồi khuông dưới và hoà tấu. Bài 9 tách ô 9–24 rồi ô 25–40. Bài 28 tách tại ô 35. Bài 36 tách ô 1–22 rồi ô 23 đến hết.',
      'Năm mươi Lesson là đơn vị dạy của VIBE, không phải năm mươi buổi cố định và không phải bài Practice tempo. Chưa có tệp audio. Giáo án này do VIBE biên soạn.',
    ].join('\n') : '',
  }
}

function buildPlan(source = map) {
  if (source.program_code !== 'VIOLIN' || source.level_code !== 'PRE_STEP' || source.books.length !== 2) {
    throw new Error('unexpected violin allocation')
  }
  const seen = new Set()
  const books = source.books.map(book => {
    if (book.lessons.length !== 50 || book.is_required !== true) throw new Error(`${book.subject_code} shape`)
    const pdfPages = new Set()
    book.lessons.forEach((lesson, index) => {
      if (seen.has(lesson.stable_key)) throw new Error(`duplicate ${lesson.stable_key}`)
      seen.add(lesson.stable_key)
      if (lesson.sort_order !== index + 1 || lesson.lesson_code !== `L${String(index + 1).padStart(2, '0')}`) {
        throw new Error(`${book.subject_code} order ${lesson.lesson_code}`)
      }
      lesson.pdf_pages.forEach(page => pdfPages.add(page))
      if (/practice tempo/i.test(lesson.title)) throw new Error(`tempo lesson ${lesson.title}`)
    })
    for (const ad of [18, 19, 20, 21]) {
      if (pdfPages.has(ad)) throw new Error(`${book.subject_code} uses advertising page ${ad}`)
    }
    const pieces = book.lessons.map(lesson => lesson.source_piece_number).filter(piece => piece != null)
    const expected = book.numbered_piece_count
    for (let piece = 1; piece <= expected; piece += 1) {
      if (!pieces.includes(piece)) throw new Error(`${book.subject_code} missing piece ${piece}`)
    }
    if (pieces.some(piece => piece < 1 || piece > expected)) throw new Error(`${book.subject_code} piece outside 1-${expected}`)
    return {
      subject_code: book.subject_code,
      subject_name: book.subject_name,
      is_required: true,
      subject_order: book.subject_order,
      authors: book.authors.join(', '),
      publisher: book.publisher,
      edition_label: book.edition_label,
      isbn: book.isbn,
      source_filename: book.source_filename,
      source_sha256: book.source_sha256,
      sections: book.sections.map((section, index) => ({ key: section.key, title: section.title, sort_order: index + 1 })),
      lessons: book.lessons.map(lesson => ({
        stable_key: lesson.stable_key,
        lesson_code: lesson.lesson_code,
        sort_order: lesson.sort_order,
        title: lesson.title,
        section_key: lesson.source_section_key,
        unit_title: lesson.source_section_title,
        piece_number: lesson.source_piece_number,
        part: lesson.part,
        ...teach(book, lesson),
      })),
    }
  })
  const joggers = books[0].lessons
  const listen = joggers.find(lesson => lesson.piece_number === 33)
  const cattle = joggers.find(lesson => lesson.piece_number === 34)
  if (!listen || !cattle || listen.sort_order > cattle.sort_order || listen.source_pdf_pages !== '29' || cattle.source_pdf_pages !== '28') {
    throw new Error('book 1 page swap order')
  }
  const runners = books[1].lessons
  const miles = runners.filter(lesson => lesson.piece_number === 21)
  if (miles.length !== 2 || miles.some(lesson => lesson.source_printed_pages !== '18-19' || lesson.source_pdf_pages !== '23-24')) {
    throw new Error('ten thousand miles span')
  }
  return {
    program_code: 'VIOLIN',
    level_code: 'PRE_STEP',
    level_name: 'Pre Step',
    level_type: 'FOUNDATION',
    books,
  }
}

module.exports = { buildPlan, pageSpan }
