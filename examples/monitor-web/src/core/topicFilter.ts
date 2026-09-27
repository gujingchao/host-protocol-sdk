/**
 * MQTT 3.1.1 / 5 topic-filter validation (spec 4.7): non-empty, no U+0000,
 * '+' must occupy a whole level, '#' must be the whole last level.
 * Returns an error message, or null when valid.
 */
export function validateTopicFilter(filter: string): string | null {
  if (filter.length === 0) return '主题不能为空'
  if (filter.includes('\u0000')) return '主题不能包含 U+0000'
  if (new TextEncoder().encode(filter).length > 65535) return '主题过长'
  const levels = filter.split('/')
  for (let i = 0; i < levels.length; i++) {
    const lv = levels[i]!
    if (lv.includes('#') && (lv !== '#' || i !== levels.length - 1)) return "'#' 只能单独作为最后一级"
    if (lv.includes('+') && lv !== '+') return "'+' 必须单独占据一级"
  }
  return null
}

/** Does a concrete topic match a (valid) filter? Used by demo mode to honour subscriptions. */
export function topicMatches(filter: string, topic: string): boolean {
  const f = filter.split('/')
  const t = topic.split('/')
  // Spec 4.7.2: wildcards at the first level do not match topics starting with '$'.
  if (topic.startsWith('$') && (f[0] === '#' || f[0] === '+')) return false
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true
    if (i >= t.length) return false
    if (f[i] !== '+' && f[i] !== t[i]) return false
  }
  return f.length === t.length
}
