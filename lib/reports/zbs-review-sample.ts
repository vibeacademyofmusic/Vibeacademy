import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Public Zalo-review fixture. This token is not a student report. */
export const ZBS_REVIEW_LINK_ID = '1e5bd9c7e1135d6b6fc0b59844e7ce781d328f3c079aa42a14423f3d800dcd38'

export function reviewSamplePdf(token: string) {
  if (token !== ZBS_REVIEW_LINK_ID) return null
  return readFileSync(path.join(process.cwd(), 'assets/reports/zbs-review-sample.pdf'))
}
