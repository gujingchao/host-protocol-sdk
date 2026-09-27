import { computed, ref } from 'vue'
import { parseMqttMessage, type ParseResult } from '../core/parsePayload'
import { TagStore, DEFAULT_HISTORY, type HistoryPoint, type DroppedMessage } from '../core/tagStore'
import { utf8GetString } from '../core/dotnet'
import type { MqttMessage } from '../core/tagSample'

export interface TagRow {
  tag: string
  value: number
  quality: string | null
  timestamp: Date
  count: number
  lastTopic: string
  lastFormat: 'json' | 'plain'
  history: HistoryPoint[]
}

const store = new TagStore(DEFAULT_HISTORY, 200)
/** Bumped (throttled) whenever the non-reactive store changes; computed views depend on it. */
const version = ref(0)
const rate = ref(0)
let flushTimer: ReturnType<typeof setTimeout> | undefined
let windowCount = 0

setInterval(() => {
  rate.value = windowCount
  windowCount = 0
}, 1000)

function scheduleFlush() {
  if (flushTimer !== undefined) return
  flushTimer = setTimeout(() => {
    flushTimer = undefined
    version.value++
  }, 100) // ≤10 UI refreshes/s regardless of message rate
}

/** Run one raw MQTT message through the MqttAdapter-equivalent parser and into the store. */
function ingest(msg: MqttMessage): ParseResult {
  const result = parseMqttMessage(msg)
  store.apply(result, msg.topic, utf8GetString(msg.payload), msg.receivedAt)
  windowCount++
  scheduleFlush()
  return result
}

const rows = computed<TagRow[]>(() => {
  void version.value
  return [...store.tags.values()].map((s) => ({
    tag: s.tag,
    value: s.value,
    quality: s.quality,
    timestamp: s.timestamp,
    count: s.count,
    lastTopic: s.lastTopic,
    lastFormat: s.lastFormat,
    history: s.history.toArray(),
  }))
})

const totals = computed(() => {
  void version.value
  return { ...store.totals, tags: store.tags.size }
})

const dropped = computed<DroppedMessage[]>(() => {
  void version.value
  return store.dropped.toArray().reverse() // newest first
})


export function useMonitor() {
  return {
    ingest,
    rows,
    totals,
    dropped,
    rate,
    historySize: store.historySize,
    removeTag(tag: string) {
      store.remove(tag)
      version.value++
    },
    clearDropped() {
      store.dropped.clear()
      version.value++
    },
    clearAll() {
      store.clear()
      version.value++
    },
  }
}
