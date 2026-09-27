/**
 * UI-only classification of TagSample.Quality. MqttAdapter itself treats quality as an
 * opaque string (default "Good"); these buckets follow the OPC-UA style Good/Uncertain/Bad
 * prefixes that host-station tags typically use.
 */
export type QualityLevel = 'good' | 'uncertain' | 'bad' | 'none'

export function classifyQuality(q: string | null): QualityLevel {
  if (q === null) return 'none' // explicit JSON null
  const s = q.trim().toLowerCase()
  if (s.startsWith('good')) return 'good'
  if (s.startsWith('uncertain')) return 'uncertain'
  return 'bad' // "Bad", "BadCommFailure", "", "offline", ...
}

export const isNonGood = (q: string | null) => classifyQuality(q) !== 'good'
