import { describe, expect, it } from 'vitest'
import { parseMqttMessage, tryParse, type ParseResult } from '../parsePayload'
import type { MqttMessage } from '../tagSample'

const AT = new Date('2026-09-27T01:52:00Z')
const TOPIC = 'factory/line1/press'
const msg = (payload: string | Uint8Array, topic = TOPIC): MqttMessage => ({ topic, payload, receivedAt: AT })
const bytes = (s: string) => new TextEncoder().encode(s)

function sample(r: ParseResult) {
  expect(r.kind).toBe('sample')
  if (r.kind !== 'sample') throw new Error('unreachable')
  return r.sample
}

describe('plain numeric payloads (tag = topic, quality = "Good")', () => {
  it('parses the README example', () => {
    const s = sample(parseMqttMessage(msg(bytes('2.4'))))
    expect(s).toEqual({ tag: TOPIC, value: 2.4, timestamp: AT, quality: 'Good' })
  })

  it.each([
    ['42', 42],
    ['-1.5', -1.5],
    ['+2', 2],
    ['.5', 0.5],
    ['5.', 5],
    ['1e3', 1000],
    ['1.5E-3', 0.0015],
    ['  \t3.25\r\n', 3.25],
    ['00012', 12],
  ])('%j -> %d', (p, v) => {
    const s = sample(parseMqttMessage(msg(p)))
    expect(s.value).toBe(v)
    expect(s.tag).toBe(TOPIC)
    expect(s.quality).toBe('Good')
  })

  it('uses ReceivedAt as timestamp, never the clock', () => {
    expect(sample(parseMqttMessage(msg('1'))).timestamp).toBe(AT)
  })

  it('keeps the topic verbatim as the tag (including wildcard-looking chars)', () => {
    expect(sample(parseMqttMessage(msg('5', 'a/+/b#'))).tag).toBe('a/+/b#')
  })

  it('accepts .NET special values: NaN / Infinity (case-insensitive) and overflow', () => {
    expect(sample(parseMqttMessage(msg('NaN'))).value).toBeNaN()
    expect(sample(parseMqttMessage(msg('nan'))).value).toBeNaN()
    expect(sample(parseMqttMessage(msg('-Infinity'))).value).toBe(-Infinity)
    expect(sample(parseMqttMessage(msg('+infinity'))).value).toBe(Infinity)
    expect(sample(parseMqttMessage(msg('1e400'))).value).toBe(Infinity)
  })

  it('trims .NET whitespace (NEL, NBSP) and tolerates trailing NULs', () => {
    expect(sample(parseMqttMessage(msg('\u0085\u00a07\u00a0'))).value).toBe(7)
    expect(sample(parseMqttMessage(msg('12\0\0'))).value).toBe(12)
  })
})

describe('JSON payloads {"tag","value","quality"}', () => {
  it('parses the full object', () => {
    const s = sample(parseMqttMessage(msg('{"tag":"TEMP","value":36.5,"quality":"Good"}')))
    expect(s).toEqual({ tag: 'TEMP', value: 36.5, timestamp: AT, quality: 'Good' })
  })

  it('defaults quality to "Good" when absent, keeps custom quality', () => {
    expect(sample(parseMqttMessage(msg('{"tag":"T","value":1}'))).quality).toBe('Good')
    expect(sample(parseMqttMessage(msg('{"tag":"T","value":1,"quality":"Bad"}'))).quality).toBe('Bad')
  })

  it('explicit "quality": null yields null (not "Good")', () => {
    expect(sample(parseMqttMessage(msg('{"tag":"T","value":1,"quality":null}'))).quality).toBeNull()
  })

  it('falls back to the topic when tag is missing, null, empty or whitespace', () => {
    for (const p of ['{"value":7}', '{"tag":null,"value":7}', '{"tag":"","value":7}', '{"tag":" \\t ","value":7}']) {
      expect(sample(parseMqttMessage(msg(p))).tag).toBe(TOPIC)
    }
  })

  it('does not trim a non-blank tag and matches keys case-sensitively', () => {
    expect(sample(parseMqttMessage(msg('{"tag":" A ","value":7}'))).tag).toBe(' A ')
    expect(sample(parseMqttMessage(msg('{"Tag":"A","value":7}'))).tag).toBe(TOPIC)
    expect(parseMqttMessage(msg('{"tag":"A","Value":7}')).kind).toBe('rejected')
  })

  it('duplicate keys: last one wins (like JsonElement.TryGetProperty)', () => {
    const s = sample(parseMqttMessage(msg('{"tag":"A","tag":"B","value":1,"value":2}')))
    expect([s.tag, s.value]).toEqual(['B', 2])
  })

  it('ignores extra fields such as a payload timestamp', () => {
    const s = sample(parseMqttMessage(msg('{"tag":"A","value":1,"ts":"2020-01-01T00:00:00Z"}')))
    expect(s.timestamp).toBe(AT)
  })
})

describe('invalid payloads are rejected (TryParse -> false)', () => {
  it.each([
    ['empty', ''],
    ['whitespace only', '  \r\n '],
    ['text', 'hello'],
    ['hex', '0x10'],
    ['thousands separator', '1,000'],
    ['comma decimal', '2,5'],
    ['dangling exponent', '1e'],
    ['lone dot', '.'],
    ['boolean', 'true'],
    ['JSON string', '"12"'],
    ['JSON array', '[1]'],
    ['infinity symbol', '\u221e'],
    ['full-width digits', '\uff11\uff12'],
  ])('%s', (_name, p) => {
    expect(parseMqttMessage(msg(p)).kind).toBe('rejected')
    expect(tryParse(msg(p))).toBeNull()
  })

  it.each([
    ['malformed', '{"tag":"A","value":}'],
    ['truncated', '{"tag":"A","value":1'],
    ['trailing comma', '{"value":1,}'],
    ['comment', '{"value":1 /* c */}'],
    ['single quotes', "{'value':1}"],
    ['trailing garbage', '{"value":1} x'],
    ['NaN literal', '{"value":NaN}'],
    ['missing value', '{"tag":"A"}'],
    ['empty object', '{}'],
  ])('bad JSON: %s', (_name, p) => {
    expect(parseMqttMessage(msg(p)).kind).toBe('rejected')
  })

  it('keeps a UTF-8 BOM (so BOM-prefixed payloads are rejected, like Encoding.UTF8.GetString)', () => {
    expect(parseMqttMessage(msg(new Uint8Array([0xef, 0xbb, 0xbf, 0x31, 0x32]))).kind).toBe('rejected')
  })

  it('rejects JSON nested deeper than JsonDocument MaxDepth (64)', () => {
    const deep = (n: number) => '{"value":1,"x":' + '['.repeat(n - 1) + ']'.repeat(n - 1) + '}'
    expect(parseMqttMessage(msg(deep(64))).kind).toBe('sample')
    expect(parseMqttMessage(msg(deep(65))).kind).toBe('rejected')
  })
})

describe('payloads on which MqttAdapter would throw (InvalidOperationException)', () => {
  it.each([
    ['value is a string', '{"tag":"A","value":"1.5"}'],
    ['value is null', '{"value":null}'],
    ['value is bool', '{"value":true}'],
    ['tag is a number', '{"tag":5,"value":1}'],
    ['tag is a number, no value (tag is read first)', '{"tag":5}'],
    ['quality is a number', '{"value":1,"quality":192}'],
    ['tag has an unpaired surrogate escape', '{"tag":"\\ud800","value":1}'],
  ])('%s', (_name, p) => {
    const r = parseMqttMessage(msg(p))
    expect(r.kind).toBe('error')
    expect(tryParse(msg(p))).toBeNull()
  })

  it('a bad quality is not reached when value is missing (rejected, not error)', () => {
    expect(parseMqttMessage(msg('{"quality":192}')).kind).toBe('rejected')
  })
})
