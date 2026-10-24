'use client'

import { useSyncExternalStore } from 'react'
import { DataTable, SectionCard } from '@/app/admin/_components/vibe'
import { auralLanguageLabels, auralLesson, auralPlan, type AuralLanguage, type Bilingual } from '@/lib/academic/aural'

const storageKey = 'vibe-aural-language'
const languageChangeEvent = 'vibe-aural-language-change'

function storedAuralLanguage(): AuralLanguage {
  const stored = window.localStorage.getItem(storageKey)
  return stored === 'vi' || stored === 'en' || stored === 'both' ? stored : 'both'
}

function subscribeAuralLanguage(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey) onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(languageChangeEvent, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(languageChangeEvent, onChange)
  }
}

function defaultAuralLanguage(): AuralLanguage {
  return 'both'
}

function text(language: AuralLanguage, value: Bilingual) {
  if (language === 'vi') return value.vi
  if (language === 'en') return value.en
  return null
}

function Pair({ language, value }: { language: AuralLanguage; value: Bilingual }) {
  const single = text(language, value)
  if (single) return <p className="text-sm">{single}</p>
  return <div className="grid gap-2 md:grid-cols-2">
    <p className="text-sm" lang="vi">{value.vi}</p>
    <p className="text-sm" lang="en">{value.en}</p>
  </div>
}

export function AuralLanguageSwitch({ value, onChange }: { value: AuralLanguage; onChange: (value: AuralLanguage) => void }) {
  return <div className="flex flex-wrap gap-2" role="group" aria-label="Ngôn ngữ Aural / Aural language">
    {(Object.keys(auralLanguageLabels) as AuralLanguage[]).map(language => <button key={language} type="button" className="vibe-button" aria-pressed={value === language} onClick={() => onChange(language)}>{auralLanguageLabels[language].vi} / {auralLanguageLabels[language].en}</button>)}
  </div>
}

export function useAuralLanguage() {
  const language = useSyncExternalStore(subscribeAuralLanguage, storedAuralLanguage, defaultAuralLanguage)
  function choose(next: AuralLanguage) {
    window.localStorage.setItem(storageKey, next)
    window.dispatchEvent(new Event(languageChangeEvent))
  }
  return [language, choose] as const
}

export function AuralGlossary({ grade, program }: { grade?: number; program?: string }) {
  const [language, choose] = useAuralLanguage()
  const source = program ? auralPlan.sources[program] : undefined
  return <SectionCard title="Chú giải Aural / Aural glossary">
    <AuralLanguageSwitch value={language} onChange={choose} />
    <div className="mt-4"><Pair language={language} value={auralPlan.translation} /></div>
    <div className="mt-4"><DataTable headers={['English', 'Tiếng Việt']} rows={auralPlan.glossary} /></div>
    <p className="mt-4 text-sm">C–D–E–F–G–A–B = Đô–Rê–Mi–Fa–Sol–La–Si. ♯ Thăng / Sharp. ♭ Giáng / Flat. ♮ Bình / Natural. Vỗ phách / pulse khác vỗ tiết tấu / rhythm.</p>
    {source ? <p className="mt-4 text-sm"><a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> · trang in {source.printed} · trang PDF {source.pdf} · {source.valid}. {source.note}</p> : null}
    {grade ? <p className="mt-2 text-sm">Grade {grade}: {auralPlan.lessons.filter(lesson => lesson.grade === grade).length} lesson dùng chung cho Piano, Guitar và Violin. Tiến độ của mỗi chương trình được lưu riêng.</p> : null}
  </SectionCard>
}

export function AuralLessonView({ code, program = 'PIANO' }: { code?: string | null; program?: string }) {
  const lesson = auralLesson(code)
  const [language, choose] = useAuralLanguage()
  if (!lesson) return null
  const play = lesson.memory ? auralPlan.playNote[program] : undefined
  return <div className="aural-bilingual space-y-4 print:space-y-3">
    <AuralLanguageSwitch value={language} onChange={choose} />
    <SectionCard title={`${lesson.title.vi} / ${lesson.title.en}`}>
      <h3 className="font-semibold">Mục tiêu / Objective</h3>
      <Pair language={language} value={lesson.objective} />
      <h3 className="mt-4 font-semibold">Giải thích / Explanation</h3>
      <div className="mt-2 space-y-2">{lesson.explain.map(item => <Pair key={item.en} language={language} value={item} />)}</div>
      {play ? <div className="mt-4"><h3 className="font-semibold">Hình thức trả lời của nhạc cụ này / Response on this instrument</h3><Pair language={language} value={play} /></div> : null}
      <h3 className="mt-4 font-semibold">Giáo viên / Teacher</h3>
      <Pair language={language} value={lesson.teacher} />
      <h3 className="mt-4 font-semibold">Học viên / Learner</h3>
      <Pair language={language} value={lesson.learner} />
      <h3 className="mt-4 font-semibold">Lời dẫn / Prompt</h3>
      <Pair language={language} value={lesson.prompt} />
      <h3 className="mt-4 font-semibold">Lỗi và cách sửa / Error and fix</h3>
      <Pair language={language} value={lesson.errors} />
      <Pair language={language} value={lesson.fix} />
      <h3 className="mt-4 font-semibold">Checklist</h3>
      <ul className="mt-2 space-y-2">{lesson.checklist.map(item => <li key={item.en}><Pair language={language} value={item} /></li>)}</ul>
      <h3 className="mt-4 font-semibold">Bài luyện tiếp / Next practice</h3>
      <Pair language={language} value={lesson.next} />
      <p className="mt-4 text-sm font-semibold">{lesson.material.vi} · {lesson.review.vi} / {lesson.review.en}</p>
      <p className="mt-2 text-sm">Bài luyện VIBE theo yêu cầu ABRSM / VIBE practice exercise aligned with ABRSM requirements. Chưa có audio hoặc bản nhạc giáo viên có thể đàn.</p>
    </SectionCard>
  </div>
}
