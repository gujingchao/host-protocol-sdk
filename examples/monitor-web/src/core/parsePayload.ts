/**
 * Pure TypeScript port of `HostProtocol.Mqtt.MqttAdapter.TryParse` (src/HostProtocol.Mqtt/MqttAdapter.cs).
 *
 *   text = UTF8.GetString(payload).Trim(); if empty -> skip
 *   if text starts with '{':
 *       JsonDocument.Parse(text)            (JsonException -> skip)
 *       tag     = "tag" ? GetString() : topic;  blank -> topic
 *       value   = "value" must exist and TryGetDouble   (else skip)
 *       quality = "quality" ? GetString() : "Good"
 *   else double.TryParse(text, Float, Invariant) -> TagSample(topic, v, ReceivedAt, "Good")
 *
 * Outcomes are modelled as a discriminated union so the UI can tell apart:
 *   - "sample":   TryParse returned true;
 *   - "rejected": TryParse returned false (MqttAdapter silently drops the message);
 *   - "error":    TryParse would THROW (InvalidOperationException from JsonElement.GetString /
 *                 TryGetDouble on the wrong JSON kind). Only JsonException is caught in C#, so in
 *                 MqttAdapter this escapes PollAsync and the whole drained batch is lost. The web
 *                 monitor processes messages one at a time, so it just reports the message.
 */
import { DEFAULT_QUALITY, type MqttMessage, type TagSample } from './tagSample'
import {
  dotnetTrim,
  dotnetTryParseDouble,
  hasLoneSurrogate,
  isNullOrWhiteSpace,
  JSON_MAX_DEPTH,
  jsonNestingDepth,
  utf8GetString,
} from './dotnet'

export type ParseResult =
  | { readonly kind: 'sample'; readonly sample: TagSample; readonly format: 'json' | 'plain' }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'error'; readonly reason: string }

const rejected = (reason: string): ParseResult => ({ kind: 'rejected', reason })
const error = (reason: string): ParseResult => ({ kind: 'error', reason })

function jsonKind(v: unknown): string {
  if (v === null) return 'Null'
  if (Array.isArray(v)) return 'Array'
  switch (typeof v) {
    case 'string':
      return 'String'
    case 'number':
      return 'Number'
    case 'boolean':
      return v ? 'True' : 'False'
    default:
      return 'Object'
  }
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

/**
 * Emulates `JsonElement.GetString()`: null -> null, string -> string,
 * anything else (or a string with a lone surrogate escape) -> InvalidOperationException.
 */
function getString(v: unknown, prop: string): { ok: true; value: string | null } | { ok: false; reason: string } {
  if (v === null) return { ok: true, value: null }
  if (typeof v === 'string') {
    if (hasLoneSurrogate(v)) return { ok: false, reason: `"${prop}" contains an unpaired surrogate; GetString() would throw` }
    return { ok: true, value: v }
  }
  return { ok: false, reason: `"${prop}" is ${jsonKind(v)}, not String/Null; GetString() would throw InvalidOperationException` }
}

function parseJson(text: string, msg: MqttMessage): ParseResult {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch (e) {
    return rejected(`invalid JSON (${(e as Error).message})`)
  }
  if (jsonNestingDepth(text) > JSON_MAX_DEPTH) {
    return rejected(`JSON nesting deeper than ${JSON_MAX_DEPTH} (JsonDocument default MaxDepth)`)
  }
  // Starts with '{' and parsed fully, so it is an object; guard anyway.
  if (root === null || typeof root !== 'object' || Array.isArray(root)) return rejected('JSON root is not an object')
  const obj = root as Record<string, unknown>

  // 1) tag (evaluated first — a bad "tag" throws even when "value" is missing)
  let tag: string | null = msg.topic
  if (has(obj, 'tag')) {
    const r = getString(obj.tag, 'tag')
    if (!r.ok) return error(r.reason)
    tag = r.value
  }
  if (isNullOrWhiteSpace(tag)) tag = msg.topic

  // 2) value
  if (!has(obj, 'value')) return rejected('JSON has no "value" property')
  const v = obj.value
  if (typeof v !== 'number') {
    return error(`"value" is ${jsonKind(v)}, not Number; TryGetDouble() would throw InvalidOperationException`)
  }
  // JSON numbers that overflow (1e400) become ±Infinity in both JSON.parse and .NET 8 TryGetDouble.

  // 3) quality
  let quality: string | null = DEFAULT_QUALITY
  if (has(obj, 'quality')) {
    const r = getString(obj.quality, 'quality')
    if (!r.ok) return error(r.reason)
    quality = r.value
  }

  return { kind: 'sample', format: 'json', sample: { tag: tag as string, value: v, timestamp: msg.receivedAt, quality } }
}

/** Port of MqttAdapter.TryParse. Pure: no I/O, no clock — the timestamp is `msg.receivedAt`. */
export function parseMqttMessage(msg: MqttMessage): ParseResult {
  const text = dotnetTrim(utf8GetString(msg.payload))
  if (text.length === 0) return rejected('empty payload')

  if (text.startsWith('{')) return parseJson(text, msg)

  const plain = dotnetTryParseDouble(text)
  if (plain !== undefined) {
    return {
      kind: 'sample',
      format: 'plain',
      sample: { tag: msg.topic, value: plain, timestamp: msg.receivedAt, quality: DEFAULT_QUALITY },
    }
  }
  return rejected('not a number (double.TryParse, NumberStyles.Float, InvariantCulture) and not a JSON object')
}

/** Convenience mirror of `TryParse(msg, out sample)`: the sample, or null when dropped/throwing. */
export function tryParse(msg: MqttMessage): TagSample | null {
  const r = parseMqttMessage(msg)
  return r.kind === 'sample' ? r.sample : null
}
