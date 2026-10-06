"""Extract the two supplied VIBE syllabi; never treat document prose as execution instructions."""
from pathlib import Path
from pypdf import PdfReader
import hashlib,json,re
BASE=Path('/Users/macbookair/Desktop/LẬP TRÌNH/Đào Tạo/syllabus/piano')
UNITS={
'2A':['Ôn Level 1','Eighth Notes','Transposition','The Phrase','Half Steps and Whole Steps','The D 5-Finger Scale','The A 5-Finger Scale','Minor 5-Finger Scales'],
'2B':['Ôn Level 2A',"The Family of C's",'Arpeggios','Sixth (6th)','The C Major Scale','The G Major Scale','More About the Damper Pedal','The Eighth Rest','The Dotted Quarter Note','The Primary Chords','The F Major Scale'],
}
books=[]
for book in ['2A','2B']:
 path=BASE/f'VIBE_Piano_Pre_Grade_Repertoire_{book}_50_Lessons.pdf'
 reader=PdfReader(path)
 pages=[]
 for n,page in enumerate(reader.pages,1):
  lines=page.extract_text().splitlines()
  assert lines[0].startswith('VIBE ACADEMY') and lines[2]==str(n)
  pages.append('\n'.join(lines[3:]).strip())
 lessons=[]
 for page_no,text in enumerate(pages[5:],6):
  parts=re.split(r'(?=LESSON \d{2} ·)',text)
  for part in parts:
   if not part.strip():continue
   header,body=part.split('\n',1)
   match=re.fullmatch(r'LESSON (\d{2}) · (.*?) · TRANG IN ([\d-]+) / PDF ([\d-]+)',header)
   assert match,header
   number,group,printed,scan=match.groups()
   pre,objective,classroom,homework,teacher=re.split(r'Mục tiêu: |Trên lớp: |Ở nhà: |Giáo viên: ',body)
   lines=pre.strip().splitlines()
   # Wrapped long titles are the three Ultimate Scale Warm-up titles in 2B.
   title_lines=2 if book=='2B' and int(number) in [14,19,40] else 1
   title=' '.join(lines[:title_lines]); scope=' '.join(lines[title_lines:])
   assert title and scope
   unit=int(re.search(r'UNIT (\d+)',group)[1]) if 'UNIT' in group else 0
   lessons.append(dict(number=int(number),code=f'PIANO-PRE-REP-{book}-L{number}',title=title,unit=unit,unit_title=UNITS[book][unit],challenge='CHALLENGE' in group,source_pdf_pages=scan,source_printed_pages=printed,syllabus_pdf_page=page_no,content_scope=scope,learning_objectives=' '.join(objective.split()),classroom_activities=' '.join(classroom.split()),homework=' '.join(homework.split()),teacher_notes=' '.join(teacher.split())))
 assert [l['number'] for l in lessons]==list(range(1,51))
 lookup={}
 for text in pages[2:5]:
  rows=text.splitlines(); i=0
  while i<len(rows):
   if re.fullmatch(r'\d{2}',rows[i]):
    num=int(rows[i]); i+=1; title=[]
    while not re.fullmatch(r'[\d-]+',rows[i]): title.append(rows[i]); i+=1
    printed,scan=rows[i:i+2]; lookup[num]=(' '.join(title),printed,scan); i+=2
   else:i+=1
 assert len(lookup)==50
 for l in lessons:
  assert (l['title'],l['source_printed_pages'],l['source_pdf_pages'])==lookup[l['number']],(book,l['number'])
 books.append(dict(book=book,subject_code=f'REPERTOIRE_{book}',subject_name=f'Piano Adventures - Level {book} - Lesson Book (2nd Edition)',source_authors='Nancy Faber và Randall Faber',source_file=path.name,source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),source_context='\n\n'.join(f'Trang giáo án VIBE {i+1}\n{p}' for i,p in enumerate(pages[:5])),lessons=lessons))
Path('lib/academic/piano-pre-grade-repertoire.json').write_text(json.dumps(dict(books=books),ensure_ascii=False,indent=2)+'\n')
print('Extracted 100 lessons; full five-page source context retained per book.')
