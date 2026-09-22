const demo = {
    student: {
      name: 'Nguyễn An Nam',
      code: 'VIBE-2026-001',
    },

    branch: {
      name: 'Vibe Academy Cần Thơ',
    },

    className: 'Piano Foundation A',

    teachers: [
      {
        name: 'Nguyễn Trà My',
        role: 'Main Teacher',
      },
    ],

    period: {
      start: '01/08/2026',
      end: '31/08/2026',
    },

    academic: {
      program: 'Piano Program',
      level: 'Foundation',

      subjects: [
        {
          name: 'Guitar New Method',
          status: 'IN_PROGRESS',
          components: [
            {
              name: 'Lesson 1',
              status: 'PASS',
              items: [
                { name: 'Exercise 1', status: 'PASS' },
                { name: 'Exercise 2', status: 'MERIT' },
                { name: 'Reading Practice', status: 'DISTINCTION' },
              ],
            },
            {
              name: 'Lesson 2',
              status: 'IN_PROGRESS',
              items: [
                { name: 'Exercise 1', status: 'IN_PROGRESS' },
                { name: 'Exercise 2', status: 'NOT_STARTED' },
              ],
            },
          ],
        },

        {
          name: 'Music Theory',
          status: 'MERIT',
          components: [
            {
              name: 'Notation',
              status: 'MERIT',
              items: [
                { name: 'Note Values', status: 'PASS' },
                { name: 'Treble Clef', status: 'MERIT' },
              ],
            },
          ],
        },

        {
          name: 'Aural',
          status: 'PASS',
          components: [],
        },
      ],
    },

    attendance: {
      scheduled: 8,
      attended: 7,
      absent: 1,
      excused: 0,
      makeup: 1,
      rate: 87.5,
    },

    assessment: {
      achievement:
        'Học viên có tiến bộ rõ về khả năng đọc bản nhạc và kiểm soát nhịp độ.',

      difficulty:
        'Khả năng duy trì nhịp ổn định trong các bài dài vẫn cần được củng cố.',

      intervention:
        'Giáo viên đã chia nhỏ bài tập, sử dụng metronome và tăng thời lượng luyện đọc tại lớp.',

      nextPlan:
        'Hoàn thành Lesson 2 và bắt đầu Lesson 3. Tiếp tục củng cố Music Theory và Aural.',

      practiceConsistency:
        'Good',

      lessonPreparation:
        'Good',

      learningAttitude:
        'Excellent',
    },
  }

  function statusClass(status: string) {
    switch (status) {
      case 'PASS':
        return 'bg-green-50 text-green-700'

      case 'MERIT':
        return 'bg-blue-50 text-blue-700'

      case 'DISTINCTION':
        return 'bg-amber-50 text-amber-700'

      case 'IN_PROGRESS':
        return 'bg-orange-50 text-orange-700'

      default:
        return 'bg-gray-100 text-gray-600'
    }
  }

  function label(status: string) {
    switch (status) {
      case 'NOT_STARTED':
        return 'Not Started'

      case 'IN_PROGRESS':
        return 'In Progress'

      case 'PASS':
        return 'Pass'

      case 'MERIT':
        return 'Merit'

      case 'DISTINCTION':
        return 'Distinction'

      default:
        return status
    }
  }

  export default function LearningReportDemoPage() {
    return (
      <div className="min-h-screen bg-gray-100 py-10">
        <div className="mx-auto max-w-5xl px-4">

          {/* Admin toolbar */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Demo only
              </p>

              <h1 className="text-2xl font-bold text-gray-950">
                Learning Report Preview
              </h1>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white"
            >
              Print / PDF
            </button>
          </div>

          {/* A4 paper */}
          <article className="mx-auto bg-white px-12 py-12 shadow-sm print:shadow-none">

            {/* Header */}
            <header className="text-center">
              <p className="text-sm font-semibold tracking-[0.18em] text-gray-700">
                VIBE ACADEMY OF MUSIC & CINEMA
              </p>

              <h2 className="mt-4 font-serif text-4xl font-semibold tracking-wide text-gray-950">
                LEARNING PROGRESS REPORT
              </h2>

              <div className="mx-auto mt-5 h-px max-w-xl bg-amber-300" />
            </header>

            {/* Student info */}
            <section className="mt-10">
              <h3 className="text-xs font-bold tracking-[0.16em] text-gray-500">
                STUDENT INFORMATION
              </h3>

              <div className="mt-4 grid gap-8 border-y border-gray-200 py-5 md:grid-cols-2">
                <div className="space-y-4">
                  <Info label="Student" value={demo.student.name} />
                  <Info label="Student Code" value={demo.student.code} />
                  <Info label="Branch" value={demo.branch.name} />
                  <Info label="Class" value={demo.className} />
                </div>

                <div className="space-y-4 md:border-l md:border-gray-200 md:pl-8">
                  <Info label="Program" value={demo.academic.program} />
                  <Info label="Level" value={demo.academic.level} />
                  <Info
                    label="Teacher"
                    value={demo.teachers.map((teacher) => teacher.name).join(', ')}
                  />
                  <Info
                    label="Report Period"
                    value={`${demo.period.start} → ${demo.period.end}`}
                  />
                </div>
              </div>
            </section>

            {/* Attendance */}
            <section className="mt-10">
              <SectionTitle>ATTENDANCE SUMMARY</SectionTitle>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
                <Metric label="Scheduled" value={demo.attendance.scheduled} />
                <Metric label="Attended" value={demo.attendance.attended} />
                <Metric label="Absent" value={demo.attendance.absent} />
                <Metric label="Excused" value={demo.attendance.excused} />
                <Metric label="Make-up" value={demo.attendance.makeup} />
                <Metric
                  label="Attendance Rate"
                  value={`${demo.attendance.rate}%`}
                />
              </div>
            </section>

            {/* Academic Progress */}
            <section className="mt-10">
              <SectionTitle>ACADEMIC PROGRESS</SectionTitle>

              <div className="mt-5 space-y-6">
                {demo.academic.subjects.map((subject) => (
                  <div
                    key={subject.name}
                    className="rounded-xl border border-gray-200"
                  >
                    <div className="flex items-center justify-between bg-gray-50 px-5 py-4">
                      <p className="font-semibold text-gray-950">
                        {subject.name}
                      </p>

                      <StatusBadge status={subject.status} />
                    </div>

                    {subject.components.length > 0 && (
                      <div className="divide-y divide-gray-100">
                        {subject.components.map((component) => (
                          <div
                            key={component.name}
                            className="px-5 py-4"
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-gray-800">
                                {component.name}
                              </p>

                              <StatusBadge status={component.status} />
                            </div>

                            {component.items.length > 0 && (
                              <div className="mt-3 space-y-2 border-l-2 border-gray-100 pl-4">
                                {component.items.map((item) => (
                                  <div
                                    key={item.name}
                                    className="flex items-center justify-between"
                                  >
                                    <p className="text-sm text-gray-600">
                                      {item.name}
                                    </p>

                                    <StatusBadge status={item.status} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Teacher assessment */}
            <section className="mt-10">
              <SectionTitle>TEACHER ASSESSMENT</SectionTitle>

              <div className="mt-5 space-y-6">
                <AssessmentBlock
                  title="ACHIEVEMENT & PROGRESS"
                  value={demo.assessment.achievement}
                />

                <AssessmentBlock
                  title="CURRENT CHALLENGES"
                  value={demo.assessment.difficulty}
                />

                <AssessmentBlock
                  title="TEACHER INTERVENTION"
                  value={demo.assessment.intervention}
                />

                <AssessmentBlock
                  title="NEXT PERIOD PLAN"
                  value={demo.assessment.nextPlan}
                />

                <div className="grid gap-4 md:grid-cols-3">
                  <AssessmentMetric
                    title="PRACTICE CONSISTENCY"
                    value={demo.assessment.practiceConsistency}
                  />

                  <AssessmentMetric
                    title="LESSON PREPARATION"
                    value={demo.assessment.lessonPreparation}
                  />

                  <AssessmentMetric
                    title="LEARNING ATTITUDE"
                    value={demo.assessment.learningAttitude}
                  />
                </div>
              </div>
            </section>

            {/* Approval */}
            <section className="mt-12 border-t border-gray-200 pt-8">
              <SectionTitle>AUTHORIZED ACADEMIC APPROVAL</SectionTitle>

              <div className="mt-8 flex justify-end">
                <div className="w-64 text-center">
                  <div className="h-14" />

                  <div className="border-t border-gray-400 pt-2">
                    <p className="text-sm font-semibold text-gray-800">
                      Academic Department
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      Vibe Academy of Music & Cinema
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <footer className="mt-12 border-t border-gray-100 pt-4 text-center text-xs text-gray-400">
              VIBE ACADEMY OF MUSIC & CINEMA
            </footer>
          </article>
        </div>
      </div>
    )
  }

  function Info({
    label,
    value,
  }: {
    label: string
    value: string
  }) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </p>

        <p className="mt-1 text-sm font-medium text-gray-900">
          {value}
        </p>
      </div>
    )
  }

  function Metric({
    label,
    value,
  }: {
    label: string
    value: string | number
  }) {
    return (
      <div className="border border-gray-200 px-3 py-4 text-center">
        <p className="text-xl font-semibold text-gray-950">
          {value}
        </p>

        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </p>
      </div>
    )
  }

  function SectionTitle({
    children,
  }: {
    children: React.ReactNode
  }) {
    return (
      <h3 className="border-b border-gray-200 pb-2 text-xs font-bold tracking-[0.16em] text-gray-500">
        {children}
      </h3>
    )
  }

  function StatusBadge({
    status,
  }: {
    status: string
  }) {
    return (
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
          status
        )}`}
      >
        {label(status)}
      </span>
    )
  }

  function AssessmentBlock({
    title,
    value,
  }: {
    title: string
    value: string
  }) {
    return (
      <div>
        <p className="font-serif text-sm font-semibold tracking-wide text-gray-800">
          {title}
        </p>

        <p className="mt-2 text-sm leading-6 text-gray-600">
          {value}
        </p>
      </div>
    )
  }

  function AssessmentMetric({
    title,
    value,
  }: {
    title: string
    value: string
  }) {
    return (
      <div className="border-t border-gray-200 pt-3">
        <p className="text-[10px] font-bold tracking-wide text-gray-400">
          {title}
        </p>

        <p className="mt-2 text-sm font-semibold text-gray-800">
          {value}
        </p>
      </div>
    )
  }