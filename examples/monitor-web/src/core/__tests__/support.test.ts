import { describe, expect, it } from 'vitest'
import { RingBuffer } from '../ringBuffer'
import { TagStore } from '../tagStore'
import { classifyQuality } from '../quality'
import { topicMatches, validateTopicFilter } from '../topicFilter'
import { DemoGenerator } from '../demo'
import { parseMqttMessage } from '../parsePayload'
import { dotnetTrim, isNullOrWhiteSpace } from '../dotnet'

describe('RingBuffer', () => {
  it('keeps only the newest `capacity` items in order', () => {
    const rb = new RingBuffer<number>(3)
    for (let i = 1; i <= 5; i++) rb.push(i)
    expect(rb.toArray()).toEqual([3, 4, 5])
    expect(rb.length).toBe(3)
    rb.clear()
    expect(rb.toArray()).toEqual([])
  })
  it('rejects bad capacity', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError)
  })
})

describe('TagStore', () => {
  it('tracks latest value, count and a bounded history per tag', () => {
    const store = new TagStore(200)
    for (let i = 0; i < 250; i++) {
      store.applySample({ tag: 'T', value: i, timestamp: new Date(i), quality: 'Good' }, 'a/b')
    }
    const st = store.tags.get('T')!
    expect(st.value).toBe(249)
    expect(st.count).toBe(250)
    expect(st.history.length).toBe(200)
    expect(st.history.toArray()[0]?.v).toBe(50)
  })

  it('counts rejected and error outcomes in the dropped log', () => {
    const store = new TagStore()
    const at = new Date()
    for (const p of ['1', 'oops', '{"value":"x"}']) {
      store.apply(parseMqttMessage({ topic: 't', payload: p, receivedAt: at }), 't', p, at)
    }
    expect(store.totals).toEqual({ messages: 3, samples: 1, rejected: 1, errors: 1 })
    expect(store.dropped.toArray().map((d) => d.kind)).toEqual(['rejected', 'error'])
  })
})

describe('classifyQuality', () => {
  it.each([
    ['Good', 'good'],
    ['GoodLocalOverride', 'good'],
    ['Uncertain', 'uncertain'],
    ['Bad', 'bad'],
    ['BadCommFailure', 'bad'],
    ['', 'bad'],
    [null, 'none'],
  ] as const)('%j -> %s', (q, level) => expect(classifyQuality(q)).toBe(level))
})

describe('topic filters', () => {
  it('validates wildcards', () => {
    for (const ok of ['a/b', 'a/+/c', '#', 'a/#', '+', '+/+', '/a']) expect(validateTopicFilter(ok)).toBeNull()
    for (const bad of ['', 'a/#/b', 'a#', 'a/b+', 'a/+b']) expect(validateTopicFilter(bad)).not.toBeNull()
  })
  it('matches topics', () => {
    expect(topicMatches('factory/+/telemetry', 'factory/l1/telemetry')).toBe(true)
    expect(topicMatches('factory/+/telemetry', 'factory/l1/x/telemetry')).toBe(false)
    expect(topicMatches('factory/#', 'factory')).toBe(true)
    expect(topicMatches('#', '$SYS/x')).toBe(false)
    expect(topicMatches('a/b', 'a/b')).toBe(true)
    expect(topicMatches('a/b', 'a/b/c')).toBe(false)
  })
})

describe('DemoGenerator', () => {
  it('emits raw messages that parse via the same MqttAdapter rules', () => {
    const gen = new DemoGenerator({ seed: 42, badPayloadRate: 0 })
    const results = gen.next(new Date(1000)).map(parseMqttMessage)
    expect(results.length).toBeGreaterThan(3)
    expect(results.every((r) => r.kind === 'sample')).toBe(true)
    const tags = results.map((r) => (r.kind === 'sample' ? r.sample.tag : ''))
    expect(tags).toContain('demo/line1/temp') // plain → topic
    expect(tags).toContain('LINE1.SPEED') // JSON tag
    expect(tags).toContain('demo/tank/level') // blank JSON tag → topic
  })
  it('includes bad payloads when asked to', () => {
    const gen = new DemoGenerator({ seed: 1, badPayloadRate: 1 })
    const kinds = gen.next().map((m) => parseMqttMessage(m).kind)
    expect(kinds.some((k) => k !== 'sample')).toBe(true)
  })
})

describe('.NET string helpers', () => {
  it('Trim uses char.IsWhiteSpace (NEL yes, BOM no)', () => {
    expect(dotnetTrim('\u0085 x \u3000')).toBe('x')
    expect(dotnetTrim('\ufeffx')).toBe('\ufeffx')
    expect(isNullOrWhiteSpace(null)).toBe(true)
    expect(isNullOrWhiteSpace('\u2003')).toBe(true)
    expect(isNullOrWhiteSpace('\ufeff')).toBe(false)
  })
})
