import type { MqttMessage } from './tagSample'

/**
 * Local fake telemetry for "demo mode". It produces raw MqttMessages (bytes + topic),
 * NOT TagSamples, so demo data goes through exactly the same parser as broker data —
 * including a few payloads MqttAdapter would reject or throw on.
 */
export interface DemoOptions {
  /** Deterministic PRNG seed (tests); defaults to Date.now(). */
  seed?: number
  /** Probability of emitting a malformed / throwing payload per tick. */
  badPayloadRate?: number
}

/** mulberry32 — tiny deterministic PRNG. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Channel {
  topic: string
  /** JSON "tag" (JSON payload) or undefined (plain numeric payload → tag = topic). */
  tag?: string
  base: number
  amp: number
  period: number
  noise: number
  decimals: number
}

const CHANNELS: Channel[] = [
  { topic: 'demo/line1/temp', base: 36.5, amp: 2.5, period: 30, noise: 0.15, decimals: 2 },
  { topic: 'demo/line1/press', base: 2.4, amp: 0.3, period: 12, noise: 0.03, decimals: 3 },
  { topic: 'demo/line1/telemetry', tag: 'LINE1.SPEED', base: 1200, amp: 150, period: 45, noise: 8, decimals: 1 },
  { topic: 'demo/line2/telemetry', tag: 'LINE2.CURRENT', base: 14, amp: 3, period: 20, noise: 0.4, decimals: 2 },
  { topic: 'demo/line2/telemetry', tag: 'LINE2.VIBRATION', base: 0.8, amp: 0.5, period: 8, noise: 0.1, decimals: 3 },
  { topic: 'demo/tank/level', tag: '', base: 55, amp: 20, period: 90, noise: 0.5, decimals: 1 }, // blank tag → topic
]

const BAD_PAYLOADS: { topic: string; payload: string }[] = [
  { topic: 'demo/line1/temp', payload: 'sensor offline' }, // rejected: not a number
  { topic: 'demo/line2/telemetry', payload: '{"tag":"LINE2.CURRENT","value":' }, // rejected: bad JSON
  { topic: 'demo/line2/telemetry', payload: '{"tag":"LINE2.CURRENT"}' }, // rejected: no value
  { topic: 'demo/line1/telemetry', payload: '{"tag":"LINE1.SPEED","value":"1200"}' }, // error: value is a string
  { topic: 'demo/line1/press', payload: '' }, // rejected: empty
]

export class DemoGenerator {
  private readonly rnd: () => number
  private readonly badRate: number
  private tick = 0
  private readonly enc = new TextEncoder()

  constructor(opts: DemoOptions = {}) {
    this.rnd = prng(opts.seed ?? Date.now())
    this.badRate = opts.badPayloadRate ?? 0.03
  }

  /** One round: one message per channel, plus occasionally a bad payload. */
  next(now: Date = new Date()): MqttMessage[] {
    const k = this.tick++
    const out: MqttMessage[] = []
    for (const ch of CHANNELS) {
      const v = ch.base + ch.amp * Math.sin((2 * Math.PI * k) / ch.period) + ch.noise * (this.rnd() * 2 - 1)
      const value = Number(v.toFixed(ch.decimals))
      let payload: string
      if (ch.tag === undefined) {
        payload = String(value)
      } else {
        const r = this.rnd()
        const quality = r < 0.04 ? 'Bad' : r < 0.09 ? 'Uncertain' : undefined // omitted → adapter defaults to "Good"
        payload = JSON.stringify(quality ? { tag: ch.tag, value, quality } : { tag: ch.tag, value })
      }
      out.push({ topic: ch.topic, payload: this.enc.encode(payload), receivedAt: now })
    }
    if (this.rnd() < this.badRate) {
      const bad = BAD_PAYLOADS[Math.floor(this.rnd() * BAD_PAYLOADS.length)]!
      out.push({ topic: bad.topic, payload: this.enc.encode(bad.payload), receivedAt: now })
    }
    return out
  }
}

export const DEMO_TOPICS = [...new Set(CHANNELS.map((c) => c.topic))]
