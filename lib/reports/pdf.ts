import { displayLabel } from '@/lib/display'
import { reportSummaryLabels } from './summary-labels'
import PDFDocument from 'pdfkit'
import path from 'node:path'
import type { Snapshot } from '@/app/admin/reports/learning/data'
export async function renderLearningPdf(report:{id:string;version:number;type:string;snapshot:Snapshot}):Promise<Buffer> {
  const doc=new PDFDocument({size:'A4',margin:48,bufferPages:true,info:{Title:'Báo cáo học tập VIBE Academy',Author:'VIBE Academy'}})
  const chunks:Buffer[]=[]
  const complete=new Promise<Buffer>((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)})
  doc.font(path.join(process.cwd(),'assets/fonts/NotoSans-Regular.ttf')).fillColor('#183044')
  const text=(value:string,size=11)=>{doc.fontSize(size).text(value,{lineGap:3});doc.moveDown(0.4)}
  const heading=(value:string)=>{if(doc.y>690)doc.addPage();doc.moveDown(0.4);text(value,14)}
  const s=report.snapshot
  text('VIBE ACADEMY',22);text(report.type==='MONTHLY'?'BÁO CÁO HỌC TẬP THÁNG':'BÁO CÁO CUỐI KHÓA',16)
  text(`${s.student.name} · ${s.student.code}`);text(`${s.period_start} — ${s.period_end} · Phiên bản ${report.version}`)
  heading('Thông tin học tập');text(`${s.branch.name} · ${s.class_name}`);text(`${s.academic.curriculum??'Chưa gán'} · ${s.academic.current_grade??'Chưa xác định'}`)
  heading('Tiến độ và đánh giá')
  for(const subject of s.academic.subjects){text(`${subject.name}: ${displayLabel(subject.status)}${subject.score==null?'':` · Điểm ${subject.score}`}`);for(const c of subject.components)text(`  ${c.name}: ${displayLabel(c.status)}${c.score==null?'':` · Điểm ${c.score}`}`,10)}
  heading('Chuyên cần');text(`Có mặt / đi muộn: ${s.attendance.attended} · Vắng: ${s.attendance.absent} · Có phép: ${s.attendance.excused}`);text(`Buổi đủ điều kiện: ${s.attendance.scheduled} · Tỷ lệ trên buổi đã điểm danh: ${s.attendance.rate??'Chưa có'}%`)
  heading('Nhận xét và kế hoạch phát triển')
  for(const [key,label]of Object.entries(reportSummaryLabels))if(s.teacher_summary?.[key])text(`${label}: ${s.teacher_summary[key]}`)
  heading('Nhật ký đã nộp');for(const j of s.journals.excerpts){text(j.content);if(j.homework)text(`Luyện tập tại nhà: ${j.homework}`,10)}
  heading('Trạng thái học vụ');text(`${s.academic.current_grade??'Chưa xác định'} · ${displayLabel(s.academic.status)}`);text('Kết thúc khóa học không đồng nghĩa đã hoàn tất trình độ.',10)
  const pages=doc.bufferedPageRange()
  for(let i=pages.start;i<pages.start+pages.count;i++){doc.switchToPage(i);doc.fontSize(8).fillColor('#536171').text(`VIBE Academy · Bản đã phát hành · Trang ${i+1}/${pages.count}`,48,790,{lineBreak:false})}
  doc.end();return complete
}
