import { createServer, type Server, type Socket } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMqttConnection } from '../useMqttConnection'

describe('MQTT connection recovery', () => {
  let server: Server | undefined
  let connection: ReturnType<typeof useMqttConnection> | undefined
  let attempts: number
  const sockets = new Set<Socket>()

  beforeEach(() => {
    attempts = 0
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({ topics: [] })),
      setItem: vi.fn(),
    })
  })

  afterEach(async () => {
    connection?.disconnect()
    connection = undefined
    for (const socket of sockets) socket.destroy()
    sockets.clear()
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()))
      })
      server = undefined
    }
    vi.unstubAllGlobals()
  })

  async function startBroker(protocolVersion: 4 | 5, rejectFirst = false) {
    server = createServer((socket) => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
      socket.on('error', () => {})
      // The first client packet is CONNECT. Reply with a real wire-format CONNACK.
      socket.once('data', () => {
        attempts++
        const refused = rejectFirst && attempts === 1
        const connack = protocolVersion === 5
          ? [0x20, 0x03, 0x00, refused ? 0x87 : 0x00, 0x00]
          : [0x20, 0x02, 0x00, refused ? 0x05 : 0x00]
        socket.write(Buffer.from(connack))
      })
    })
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject)
      server!.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing broker address')
    connection = useMqttConnection(vi.fn())
    connection.settings.url = `mqtt://127.0.0.1:${address.port}`
    connection.settings.protocolVersion = protocolVersion
    return connection
  }

  it.each([4, 5] as const)('actually retries a rejected MQTT %i connection when enabled', async (version) => {
    const conn = await startBroker(version, true)
    conn.connect()

    await vi.waitFor(() => {
      expect(conn.status.value).toBe('reconnecting')
      expect(conn.lastError.value).toContain('Connection refused')
    })
    await vi.waitFor(() => expect(conn.status.value).toBe('connected'), { timeout: 5_000 })
    expect(attempts).toBe(2)
    expect(conn.lastError.value).toBeNull()
  }, 10_000)

  it.each([4, 5] as const)('stays disconnected after a rejected MQTT %i connection when retries are disabled', async (version) => {
    const conn = await startBroker(version, true)
    conn.settings.autoReconnect = false
    conn.connect()

    await vi.waitFor(() => {
      expect(conn.status.value).toBe('disconnected')
      expect(conn.lastError.value).toContain('Connection refused')
    })
    await new Promise((resolve) => setTimeout(resolve, 3_200))
    expect(attempts).toBe(1)
    expect(conn.status.value).toBe('disconnected')
  }, 10_000)

  it.each(['access denied', 'quota exceeded'])('connects and updates subscriptions when storage reports %s', async (failure) => {
    if (failure === 'access denied') {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get: () => { throw new DOMException('Storage blocked', 'SecurityError') },
      })
    } else {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => JSON.stringify({ topics: [] })),
        setItem: () => { throw new DOMException('Storage full', 'QuotaExceededError') },
      })
    }
    const conn = await startBroker(4)
    expect(() => conn.connect()).not.toThrow()
    await vi.waitFor(() => expect(conn.status.value).toBe('connected'))
    expect(attempts).toBe(1)

    expect(conn.addSubscription('extra/telemetry')).toBeNull()
    expect(conn.subscriptions.value.some((sub) => sub.filter === 'extra/telemetry')).toBe(true)
    expect(() => conn.removeSubscription('extra/telemetry')).not.toThrow()
    expect(conn.subscriptions.value.some((sub) => sub.filter === 'extra/telemetry')).toBe(false)
    expect(conn.status.value).toBe('connected')
  })
})
