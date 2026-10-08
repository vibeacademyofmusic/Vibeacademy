export const positiveFeedbackReasons = [
  ['TEACHER_CLEAR_GUIDANCE', 'Giảng viên hướng dẫn dễ hiểu'],
  ['CONTENT_APPROPRIATE', 'Nội dung buổi học phù hợp'],
  ['TEACHER_SUPPORTIVE', 'Giảng viên tận tâm và hỗ trợ tốt'],
  ['SESSION_ON_TIME', 'Buổi học diễn ra đúng giờ, đúng kế hoạch'],
  ['OVERALL_SATISFIED', 'Tôi hài lòng với buổi học hôm nay'],
] as const

export const improvementFeedbackReasons = [
  ['CONTENT_UNCLEAR', 'Nội dung buổi học chưa dễ hiểu'],
  ['PACE_INAPPROPRIATE', 'Tiến độ buổi học chưa phù hợp'],
  ['TEACHER_SUPPORT_INSUFFICIENT', 'Tôi chưa nhận được đủ sự hỗ trợ từ giảng viên'],
  ['SESSION_TIMING_ISSUE', 'Buổi học chưa diễn ra đúng giờ hoặc đúng kế hoạch'],
  ['CONTENT_BELOW_EXPECTATION', 'Nội dung buổi học chưa đúng kỳ vọng'],
] as const

const byCode = new Map<string, string>([...positiveFeedbackReasons, ...improvementFeedbackReasons])

export function reasonsForRating(rating: number) {
  if (rating >= 4 && rating <= 5) return positiveFeedbackReasons
  if (rating >= 1 && rating <= 2) return improvementFeedbackReasons
  return []
}

export function feedbackReasonLabel(code: string) {
  return byCode.get(code) || code
}

export function validFeedbackReasons(rating: number, codes: string[]) {
  const allowed = new Set<string>(reasonsForRating(rating).map(([code]) => code))
  return codes.length === new Set(codes).size && codes.every(code => allowed.has(code))
}
