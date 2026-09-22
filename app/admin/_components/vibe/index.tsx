import Link from 'next/link'
import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes } from 'react'
import {
    formatMoney,
    type Amount,
  } from '../../_lib/money'
export { Modal, Drawer, Tabs } from './interactive'
type Children = { children: ReactNode }
export function AppPage({ children }: Children) { return <div className="vibe-page">{children}</div> }
export function Eyebrow({ children }: Children) { return <p className="vibe-eyebrow">{children}</p> }
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) { return <header className="vibe-page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <ActionBar>{actions}</ActionBar>}</header> }
export function PageSectionTitle({ children }: Children) { return <h2 className="text-lg font-semibold">{children}</h2> }
export function SectionCard({ title, children }: Children & { title?: string }) { return <section className="vibe-card">{title && <PageSectionTitle>{title}</PageSectionTitle>}{children}</section> }
export function MetricCard({ title, value, note }: { title: string; value: ReactNode; note?: string }) { return <section className="vibe-card vibe-metric"><p>{title}</p><strong>{value}</strong>{note && <small>{note}</small>}</section> }
export function StatusBadge({ children, tone = 'neutral' }: Children & { tone?: 'neutral' | 'warning' | 'error' | 'success' | 'info' }) { return <span className="vibe-badge" data-tone={tone}>{children}</span> }
export function FilterBar({ children }: Children) { return <div className="vibe-filter">{children}</div> }
export function ActionBar({ children }: Children) { return <div className="vibe-actions">{children}</div> }
export function EmptyState({ children }: Children) { return <div className="vibe-empty">{children}</div> }
export function InlineNotice({ children, tone = 'info' }: Children & { tone?: string }) { return <div className="vibe-notice" role={tone === 'error' ? 'alert' : 'status'} data-tone={tone}>{children}</div> }
export function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) { return <div className="vibe-table-scroll"><table className="vibe-table"><thead><tr>{headers.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length}><EmptyState>Chưa có dữ liệu trong phạm vi được phép xem.</EmptyState></td></tr>}</tbody></table></div> }
export function FormField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="vibe-field"><span>{label}</span><input {...props}/></label> }
export function SelectField({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) { return <label className="vibe-field"><span>{label}</span><select {...props}>{children}</select></label> }
export function MoneyDisplay({ value, currency = 'VND' }: { value: Amount; currency?: string }) { return <span className="vibe-money">{value == null ? 'Chưa tính' : formatMoney(value, currency)}</span> }
export function EmployeeSections({ id }: { id: string }) { return <nav className="vibe-tabs" aria-label="Hồ sơ nhân viên">{[['Hồ sơ', `/admin/employees?selected=${id}#profile`], ['Vai trò & đơn vị', `/admin/employees?selected=${id}#roles`], ['Chấm công', `/admin/employees/attendance?employee=${id}`], ['Thu nhập & khấu trừ', `/admin/employees/${id}/compensation`], ['Lịch sử', `/admin/employees?selected=${id}#history`], ['Phiếu lương', `/admin/employees/${id}/compensation#payslips`]].map(([name, href]) => <Link prefetch={false} key={name} href={href}>{name}</Link>)}</nav> }
