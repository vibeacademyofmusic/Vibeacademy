import Image from 'next/image'
import type { ReactNode } from 'react'

import PayslipActions from './PayslipActions'

type Props = {
  reference: string
  status: string
  startsOn: string
  endsOn: string
  children: ReactNode
}

function displayDate(value: string) {
  const [year, month, day] = value
    .slice(0, 10)
    .split('-')

  if (!year || !month || !day) {
    return value
  }

  return `${day}/${month}/${year}`
}

function displayPeriod(value: string) {
  const [year, month] = value
    .slice(0, 10)
    .split('-')

  if (!year || !month) {
    return value
  }

  return `${month}/${year}`
}

function displayStatus(status: string) {
  if (status === 'FINALIZED') {
    return 'ĐÃ CHỐT'
  }

  if (status === 'APPROVED') {
    return 'ĐÃ DUYỆT'
  }

  return status
}

export default function PayslipDocument({
  reference,
  status,
  startsOn,
  endsOn,
  children,
}: Props) {
  const period = displayPeriod(startsOn)

  return (
    <>
      {/* =================================================
          SCREEN ACTIONS
          ================================================= */}

      <div
        className="
          mx-auto
          mb-3
          flex
          w-full
          max-w-[210mm]
          justify-end
          px-2
          print:hidden
        "
      >
        <PayslipActions
          reference={reference}
          period={period}
        />
      </div>

      {/* =================================================
          A5 LANDSCAPE — SINGLE HR DOCUMENT
          210mm × 148mm
          ================================================= */}

      <main
        id="vibe-payslip-sheet"
        className="
          vibe-payslip-sheet
          mx-auto
          h-[148mm]
          w-full
          max-w-[210mm]
          overflow-hidden
          bg-white
          px-[8mm]
          py-[6mm]
          text-slate-900
          shadow-sm
          print:m-0
          print:max-w-none
          print:shadow-none
        "
      >
        {/* =================================================
            FORMAL HEADER
            ================================================= */}

        <header className="vibe-formal-header">
          <div className="vibe-brand-zone">
            {/* Logo position intentionally preserved:
                aligned visually with Payroll Statement.
            */}
            <div className="vibe-logo-wrap">
              <Image
                src="/vibe-logo.png"
                alt="VIBE Academy of Music & Cinema"
                width={220}
                height={122}
                priority
                className="vibe-logo"
              />
            </div>

            <div
              className="vibe-brand-rule"
              aria-hidden="true"
            />

            <div className="vibe-title-block">
              <p className="vibe-department">
                PHÒNG NHÂN SỰ · CÔNG &amp; LƯƠNG
              </p>

              <h1 className="vibe-document-title">
                PHIẾU LƯƠNG
              </h1>

              <p className="vibe-document-subtitle">
                Payroll Statement
              </p>

              <p className="vibe-period-line">
                Kỳ lương{' '}
                <strong>{period}</strong>
                <span>·</span>
                {displayDate(startsOn)}
                {' – '}
                {displayDate(endsOn)}
              </p>
            </div>
          </div>

          <aside className="vibe-meta-zone">
            <div className="vibe-meta-row">
              <span>TRẠNG THÁI</span>

              <strong className="vibe-status">
                <i aria-hidden="true" />
                {displayStatus(status)}
              </strong>
            </div>

            <div className="vibe-meta-row">
              <span>KỲ LƯƠNG</span>
              <strong>{period}</strong>
            </div>

            <div className="vibe-reference">
              <span>MÃ THAM CHIẾU</span>
              <code>{reference}</code>
            </div>
          </aside>
        </header>

        {/* =================================================
            DOCUMENT BODY
            ================================================= */}

        <div className="vibe-payslip-content">
          {children}
        </div>

        {/* =================================================
            OFFICIAL FOOTER
            ================================================= */}

        <footer className="vibe-official-footer">
          <p>
            VIBE ACADEMY OF MUSIC &amp; CINEMA
          </p>

          <p>
            TÀI LIỆU NỘI BỘ · PHÒNG NHÂN SỰ
          </p>
        </footer>
      </main>

      {/* =================================================
          FORMAL DOCUMENT STYLE
          ================================================= */}

      <style>{`
        /*
         * ==================================================
         * DOCUMENT TYPOGRAPHY
         * ==================================================
         *
         * Headings: traditional serif for formal HR identity.
         * Body/tables: restrained administrative sans-serif.
         */

        .vibe-payslip-sheet {
          box-sizing: border-box;

          font-family:
            "Helvetica Neue",
            Arial,
            Helvetica,
            sans-serif;

          font-size: 9.2pt;
          line-height: 1.35;

          font-variant-numeric: tabular-nums;

          color: #172033;
        }

        /*
         * ==================================================
         * HEADER
         * ==================================================
         */

        .vibe-formal-header {
          display: grid;
          grid-template-columns:
            minmax(0, 1fr)
            43mm;

          align-items: end;

          gap: 8mm;

          padding-bottom: 4mm;

          border-bottom:
            0.45mm solid #b89545;
        }

        .vibe-brand-zone {
          display: flex;
          align-items: flex-start;

          min-width: 0;

          gap: 4.5mm;
        }

        /*
         * Logo remains intentionally lower.
         * Its visual center sits beside Payroll Statement.
         */

        .vibe-logo-wrap {
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;

          flex: 0 0 29mm;

          padding-top: 8mm;
        }

        .vibe-logo {
          width: 29mm;
          height: auto;

          object-fit: contain;
          object-position: left center;
        }

        .vibe-brand-rule {
          align-self: stretch;

          width: 0.3mm;
          min-height: 23mm;

          background: #c8a75f;
        }

        .vibe-title-block {
          min-width: 0;
        }

        .vibe-department {
          margin: 0 0 1.2mm;

          font-size: 6.8pt;
          font-weight: 700;

          line-height: 1;

          letter-spacing: 0.16em;

          color: #637083;
        }

        .vibe-document-title {
          margin: 0;

          font-family:
            Georgia,
            "Times New Roman",
            Times,
            serif;

          font-size: 22pt;
          font-weight: 700;

          line-height: 0.98;

          letter-spacing: 0.015em;

          color: #14243a;
        }

        .vibe-document-subtitle {
          margin: 1.4mm 0 0;

          font-family:
            Georgia,
            "Times New Roman",
            Times,
            serif;

          font-size: 8.5pt;
          font-style: italic;
          font-weight: 400;

          letter-spacing: 0.035em;

          color: #778294;
        }

        .vibe-period-line {
          display: flex;
          align-items: center;
          flex-wrap: wrap;

          gap: 1.8mm;

          margin: 2.8mm 0 0;

          font-size: 7.8pt;
          font-weight: 500;

          color: #596579;
        }

        .vibe-period-line strong {
          font-weight: 700;
          color: #172033;
        }

        .vibe-period-line span {
          color: #aeb5bf;
        }

        /*
         * ==================================================
         * META
         * ==================================================
         */

        .vibe-meta-zone {
          align-self: end;

          padding-left: 4mm;

          border-left:
            0.3mm solid #d7dce3;
        }

        .vibe-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;

          gap: 3mm;

          padding: 1.3mm 0;

          border-bottom:
            0.2mm solid #edf0f3;
        }

        .vibe-meta-row > span,
        .vibe-reference > span {
          font-size: 6.3pt;
          font-weight: 700;

          letter-spacing: 0.11em;

          color: #8a94a3;
        }

        .vibe-meta-row strong {
          font-size: 7.5pt;
          font-weight: 700;

          color: #172033;
        }

        .vibe-status {
          display: inline-flex;
          align-items: center;

          gap: 1.5mm;
        }

        .vibe-status i {
          width: 1.7mm;
          height: 1.7mm;

          border-radius: 50%;

          background: #b89545;
        }

        .vibe-reference {
          padding-top: 1.5mm;
        }

        .vibe-reference code {
          display: block;

          margin-top: 1mm;

          font-family:
            "SFMono-Regular",
            Consolas,
            "Liberation Mono",
            monospace;

          font-size: 5.6pt;
          line-height: 1.3;

          overflow-wrap: anywhere;

          color: #687487;
        }

        /*
         * ==================================================
         * BODY — SINGLE PAGE COMPACT RHYTHM
         * ==================================================
         */

        .vibe-payslip-content {
          margin-top: 4mm;
        }

        /*
         * Employee identity block
         */

        .vibe-payslip-content > div:first-child {
          display: grid;

          grid-template-columns:
            minmax(0, 1fr)
            auto;

          column-gap: 8mm;
          row-gap: 0.8mm;

          align-items: end;

          margin-bottom: 3mm;

          padding-bottom: 2.5mm;

          border-bottom:
            0.2mm solid #e5e9ee;
        }

        .vibe-payslip-content > div:first-child
        > div:first-child {
          min-width: 0;
        }

        /*
         * Employee name:
         * larger and formal, clearly below document title.
         */

        .vibe-payslip-content > div:first-child
        p:first-child {
          margin: 0 !important;

          font-family:
            Georgia,
            "Times New Roman",
            Times,
            serif !important;

          font-size: 16pt !important;
          font-weight: 700 !important;

          line-height: 1.05 !important;

          letter-spacing: 0.005em !important;

          color: #14243a !important;
        }

        .vibe-payslip-content > div:first-child p {
          margin-top: 0.6mm;

          font-size: 7.4pt;

          color: #6d7787;
        }

        /*
         * Section titles
         */

        .vibe-payslip-content section {
          margin-top: 3mm !important;
        }

        .vibe-payslip-content section h2 {
          margin:
            0
            0
            1.5mm !important;

          padding-bottom: 1.1mm;

          border-bottom:
            0.35mm solid #23344c;

          font-family:
            Georgia,
            "Times New Roman",
            Times,
            serif;

          font-size: 8.8pt !important;
          font-weight: 700 !important;

          line-height: 1;

          letter-spacing: 0.055em;

          text-transform: uppercase;

          color: #1c2b40;
        }

        /*
         * ==================================================
         * TABLES
         * ==================================================
         */

        .vibe-payslip-content table {
          width: 100%;

          border-collapse: collapse;

          table-layout: auto;

          font-size: 7.5pt !important;
          line-height: 1.25;
        }

        .vibe-payslip-content thead {
          background: #f1f3f6;
        }

        .vibe-payslip-content th {
          padding:
            1.35mm
            1.45mm !important;

          border-top:
            0.25mm solid #cbd2dc;

          border-bottom:
            0.25mm solid #cbd2dc;

          font-size: 6.7pt !important;
          font-weight: 700;

          letter-spacing: 0.055em;

          text-transform: uppercase;

          white-space: nowrap;

          color: #4d596b;
        }

        .vibe-payslip-content td {
          padding:
            1.4mm
            1.45mm !important;

          border-bottom:
            0.18mm solid #e8ebef;

          vertical-align: middle;

          color: #263449;
        }

        /*
         * Numeric columns
         */

        .vibe-payslip-content th:nth-last-child(1),
        .vibe-payslip-content td:nth-last-child(1),
        .vibe-payslip-content th:nth-last-child(2),
        .vibe-payslip-content td:nth-last-child(2) {
          text-align: right;
        }

        /*
         * ==================================================
         * TOTAL / APPROVAL FOOTER FROM PAGE
         * ==================================================
         */

        .vibe-payslip-content > footer {
          display: grid;

          grid-template-columns:
            repeat(4, minmax(0, 1fr));

          gap: 0;

          margin-top: 3.5mm !important;

          padding:
            2.6mm
            3mm !important;

          border:
            0.25mm solid #cfd5dd !important;

          border-top:
            0.6mm solid #1d2d44 !important;

          background:
            linear-gradient(
              to bottom,
              #f8f9fb,
              #ffffff
            );
        }

        .vibe-payslip-content > footer p {
          margin: 0 !important;

          padding:
            0.9mm
            2mm;

          border-right:
            0.18mm solid #e1e5ea;

          font-size: 7.2pt;

          color: #566274;
        }

        .vibe-payslip-content > footer p:nth-child(4n) {
          border-right: none;
        }

        .vibe-payslip-content > footer strong {
          display: block;

          margin-top: 0.5mm;

          font-size: 8.1pt;

          color: #172033;
        }

        /*
         * Existing "Thực lĩnh" row carries text-xl.
         * Turn it into the primary HR settlement figure.
         */

        .vibe-payslip-content > footer
        .text-xl {
          font-family:
            Georgia,
            "Times New Roman",
            Times,
            serif !important;

          font-size: 13pt !important;
          font-weight: 700 !important;

          color: #14243a !important;
        }

        /*
         * Last explanatory note occupies full width.
         */

        .vibe-payslip-content > footer
        p:last-child {
          grid-column:
            1 / -1;

          margin-top: 1.4mm !important;

          padding-top: 1.4mm;

          border-top:
            0.18mm solid #e1e5ea;

          border-right: none;

          font-size: 6.3pt;

          line-height: 1.35;

          color: #7e8895;
        }

        /*
         * ==================================================
         * DOCUMENT FOOTER
         * ==================================================
         */

        .vibe-official-footer {
          position: absolute;

          right: 8mm;
          bottom: 4.5mm;
          left: 8mm;

          display: flex;
          align-items: center;
          justify-content: space-between;

          gap: 5mm;

          padding-top: 1.8mm;

          border-top:
            0.2mm solid #d9dee5;

          font-size: 5.8pt;
          font-weight: 600;

          letter-spacing: 0.07em;

          color: #8b95a3;
        }

        /*
         * Sheet must become positioning context
         * for official footer.
         */

        .vibe-payslip-sheet {
          position: relative;
        }

        /*
         * Reserve footer area so content never covers it.
         */

        .vibe-payslip-content {
          padding-bottom: 9mm;
        }

        /*
         * ==================================================
         * A5 LANDSCAPE PRINT CONTRACT
         *
         * One physical page only.
         * ==================================================
         */

        @page {
          size: A5 landscape;
          margin: 0;
        }

        @media print {
          html,
          body {
            width: 210mm !important;
            height: 148mm !important;

            margin: 0 !important;
            padding: 0 !important;

            overflow: hidden !important;

            background:
              #ffffff !important;

            -webkit-print-color-adjust:
              exact !important;

            print-color-adjust:
              exact !important;
          }

          .vibe-payslip-sheet {
            box-sizing: border-box !important;

            width: 210mm !important;
            max-width: 210mm !important;

            height: 148mm !important;
            min-height: 148mm !important;
            max-height: 148mm !important;

            margin: 0 !important;

            padding:
              6mm
              8mm !important;

            overflow: hidden !important;

            box-shadow:
              none !important;

            page-break-after:
              avoid !important;

            page-break-before:
              avoid !important;
          }

          .vibe-formal-header,
          .vibe-payslip-content,
          .vibe-official-footer,
          .vibe-payslip-content section,
          .vibe-payslip-content table,
          .vibe-payslip-content tr,
          .vibe-payslip-content > footer {
            break-inside:
              avoid !important;

            page-break-inside:
              avoid !important;
          }

          a {
            color:
              inherit !important;

            text-decoration:
              none !important;
          }
        }
      `}</style>
    </>
  )
}
