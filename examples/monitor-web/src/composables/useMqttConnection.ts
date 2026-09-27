import { reactive, ref, shallowRef } from 'vue'
import mqtt, { type IClientOptions, type MqttClient } from 'mqtt'
import { validateTopicFilter } from '../core/topicFilter'
import type { MqttMessage } from '../core/tagSample'

export type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface Subscription {
  filter: string
  qos: 0 | 1 | 2
  state: 'idle' | 'pending' | 'subscribed' | 'failed'
  error?: string
}

export interface ConnSettings {
  url: string
  clientId: string
  username: string
  password: string
  protocolVersion: 4 | 5
  autoReconnect: boolean
}

const LS_KEY = 'host-protocol-monitor:settings'

/** Same default as MqttAdapterOptions.Topics in MqttAdapter.cs. */
export const ADAPTER_DEFAULT_TOPICS = ['factory/+/telemetry']
export const DEFAULT_URL = 'ws://localhost:8083/mqtt'

function randomClientId() {
  return 'hp-monitor-' + Math.random().toString(16).slice(2, 10)
}

function loadSaved(): { settings?: Partial<ConnSettings>; topics?: string[] } {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function useMqttConnection(onMessage: (m: MqttMessage) => void) {
  const saved = loadSaved()
  const settings = reactive<ConnSettings>({
    url: DEFAULT_URL,
    username: '',
    password: '',
    protocolVersion: 4,
    autoReconnect: true,
    ...saved.settings,
    clientId: randomClientId(), // never reuse a saved id: two tabs would kick each other off
  })
  const subscriptions = ref<Subscription[]>(
    (saved.topics ?? ADAPTER_DEFAULT_TOPICS).map((filter) => ({ filter, qos: 0, state: 'idle' })),
  )
  const status = ref<ConnStatus>('disconnected')
  const lastError = ref<string | null>(null)
  const client = shallowRef<MqttClient | null>(null)
  let userClosing = false

  function persist() {
    const { password: _pw, clientId: _id, ...rest } = settings // don't store the password
    localStorage.setItem(LS_KEY, JSON.stringify({ settings: rest, topics: subscriptions.value.map((s) => s.filter) }))
  }

  function doSubscribe(sub: Subscription) {
    const c = client.value
    if (!c || !c.connected) {
      sub.state = 'idle'
      return
    }
    sub.state = 'pending'
    sub.error = undefined
    c.subscribe(sub.filter, { qos: sub.qos }, (err, granted) => {
      const g = granted?.[0]
      if (err) {
        sub.state = 'failed'
        sub.error = err.message
      } else if (g && g.qos === 128) {
        sub.state = 'failed'
        sub.error = 'broker 拒绝订阅 (SUBACK 0x80)'
      } else {
        sub.state = 'subscribed'
      }
    })
  }

  function connectBroker() {
    disconnectBroker()
    lastError.value = null
    persist()
    const opts: IClientOptions = {
      clientId: settings.clientId || randomClientId(),
      protocolVersion: settings.protocolVersion,
      clean: true,
      connectTimeout: 10_000,
      reconnectPeriod: settings.autoReconnect ? 3_000 : 0,
      resubscribe: false, // we re-subscribe ourselves on every 'connect' to keep per-topic state accurate
      username: settings.username || undefined,
      password: settings.password || undefined,
    }
    status.value = 'connecting'
    userClosing = false
    let c: MqttClient
    try {
      c = mqtt.connect(settings.url, opts)
    } catch (e) {
      status.value = 'disconnected'
      lastError.value = (e as Error).message
      return
    }
    client.value = c
    c.on('connect', () => {
      status.value = 'connected'
      lastError.value = null
      subscriptions.value.forEach(doSubscribe)
    })
    c.on('reconnect', () => (status.value = 'reconnecting'))
    c.on('close', () => {
      subscriptions.value.forEach((s) => (s.state = 'idle'))
      if (userClosing || !settings.autoReconnect) status.value = 'disconnected'
      else status.value = 'reconnecting'
    })
    c.on('error', (err) => (lastError.value = err.message))
    c.on('message', (topic, payload) => onMessage({ topic, payload, receivedAt: new Date() }))
  }

  function disconnectBroker() {
    const c = client.value
    if (!c) return
    userClosing = true
    c.removeAllListeners('message')
    c.end(true)
    client.value = null
    status.value = 'disconnected'
    subscriptions.value.forEach((s) => (s.state = 'idle'))
  }

  /** Returns an error message, or null on success. */
  function addSubscription(filter: string, qos: 0 | 1 | 2 = 0): string | null {
    const f = filter.trim()
    const err = validateTopicFilter(f)
    if (err) return err
    if (subscriptions.value.some((s) => s.filter === f)) return '已订阅该主题'
    subscriptions.value.push({ filter: f, qos, state: 'idle' })
    // push() stores a reactive proxy; subscribe via the proxy so state updates render
    const added = subscriptions.value.find((s) => s.filter === f)
    if (added) doSubscribe(added)
    persist()
    return null
  }

  function removeSubscription(filter: string) {
    const c = client.value
    if (c?.connected) c.unsubscribe(filter)
    subscriptions.value = subscriptions.value.filter((s) => s.filter !== filter)
    persist()
  }

  return {
    settings,
    subscriptions,
    status,
    lastError,
    connect: connectBroker,
    disconnect: disconnectBroker,
    addSubscription,
    removeSubscription,
    newClientId: () => (settings.clientId = randomClientId()),
  }
}
