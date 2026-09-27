import { RingBuffer } from './ringBuffer'
import type { TagSample } from './tagSample'
import type { ParseResult } from './parsePayload'

export const DEFAULT_HISTORY = 200

export interface HistoryPoint {
  readonly t: number
  readonly v: number
}

export interface TagState {
  readonly tag: string
  value: number
  quality: string | null
  timestamp: Date
  /** Number of TagSamples received for this tag. */
  count: number
  /** Topic of the most recent message (JSON "tag" can differ from topic). */
  lastTopic: string
  lastFormat: 'json' | 'plain'
  readonly history: RingBuffer<HistoryPoint>
}

export interface DroppedMessage {
  readonly kind: 'rejected' | 'error'
  readonly topic: string
  readonly payloadPreview: string
  readonly reason: string
  readonly at: Date
}

/**
 * Aggregates TagSamples per tag (latest value + bounded history) and keeps a
 * bounded log of messages MqttAdapter would drop or throw on. Framework-agnostic.
 */
export class TagStore {
  readonly tags = new Map<string, TagState>()
  readonly dropped: RingBuffer<DroppedMessage>
  totals = { messages: 0, samples: 0, rejected: 0, errors: 0 }

  constructor(
    readonly historySize = DEFAULT_HISTORY,
    droppedLogSize = 100,
  ) {
    this.dropped = new RingBuffer(droppedLogSize)
  }

  applySample(sample: TagSample, topic: string, format: 'json' | 'plain' = 'plain'): TagState {
    let st = this.tags.get(sample.tag)
    if (!st) {
      st = {
        tag: sample.tag,
        value: sample.value,
        quality: sample.quality,
        timestamp: sample.timestamp,
        count: 0,
        lastTopic: topic,
        lastFormat: format,
        history: new RingBuffer<HistoryPoint>(this.historySize),
      }
      this.tags.set(sample.tag, st)
    }
    st.value = sample.value
    st.quality = sample.quality
    st.timestamp = sample.timestamp
    st.lastTopic = topic
    st.lastFormat = format
    st.count++
    st.history.push({ t: sample.timestamp.getTime(), v: sample.value })
    return st
  }

  /** Feed one parse outcome (plus its origin) into the store. */
  apply(result: ParseResult, topic: string, payloadText: string, at: Date): void {
    this.totals.messages++
    if (result.kind === 'sample') {
      this.totals.samples++
      this.applySample(result.sample, topic, result.format)
      return
    }
    if (result.kind === 'rejected') this.totals.rejected++
    else this.totals.errors++
    this.dropped.push({
      kind: result.kind,
      topic,
      payloadPreview: payloadText.length > 200 ? payloadText.slice(0, 200) + '…' : payloadText,
      reason: result.reason,
      at,
    })
  }

  remove(tag: string): void {
    this.tags.delete(tag)
  }

  clear(): void {
    this.tags.clear()
    this.dropped.clear()
    this.totals = { messages: 0, samples: 0, rejected: 0, errors: 0 }
  }
}
