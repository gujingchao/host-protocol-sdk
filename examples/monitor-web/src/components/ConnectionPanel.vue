<script setup lang="ts">
import { computed } from 'vue'
import type { ConnSettings, ConnStatus } from '../composables/useMqttConnection'

const props = defineProps<{ settings: ConnSettings; status: ConnStatus; lastError: string | null }>()
const emit = defineEmits<{ connect: []; disconnect: []; newClientId: [] }>()

const PRESETS = [
  { label: 'EMQX 本地', url: 'ws://localhost:8083/mqtt' },
  { label: 'Mosquitto 本地', url: 'ws://localhost:9001' },
  { label: 'EMQX 公共测试 (wss)', url: 'wss://broker.emqx.io:8084/mqtt' },
]

const busy = computed(() => props.status !== 'disconnected')
const statusText: Record<ConnStatus, string> = {
  disconnected: '未连接',
  connecting: '连接中…',
  connected: '已连接',
  reconnecting: '重连中…',
}
const mixedContent = computed(() => location.protocol === 'https:' && props.settings.url.startsWith('ws://'))
</script>

<template>
  <section class="panel">
    <h2>
      Broker
      <span class="status" :class="`status-${status}`">● {{ statusText[status] }}</span>
    </h2>
    <label class="field">
      <span>WebSocket URL</span>
      <input v-model.trim="settings.url" :disabled="busy" placeholder="ws://localhost:8083/mqtt" spellcheck="false" />
    </label>
    <div class="presets">
      <button v-for="p in PRESETS" :key="p.url" class="link" :disabled="busy" @click="settings.url = p.url">{{ p.label }}</button>
    </div>
    <details>
      <summary>高级选项</summary>
      <label class="field">
        <span>Client ID</span>
        <span class="row">
          <input v-model.trim="settings.clientId" :disabled="busy" spellcheck="false" />
          <button :disabled="busy" title="随机生成" @click="emit('newClientId')">↻</button>
        </span>
      </label>
      <label class="field"><span>用户名</span><input v-model="settings.username" :disabled="busy" autocomplete="off" /></label>
      <label class="field"><span>密码（不保存）</span><input v-model="settings.password" :disabled="busy" type="password" autocomplete="off" /></label>
      <label class="field">
        <span>协议</span>
        <select v-model.number="settings.protocolVersion" :disabled="busy">
          <option :value="4">MQTT 3.1.1</option>
          <option :value="5">MQTT 5.0</option>
        </select>
      </label>
      <label class="check"><input v-model="settings.autoReconnect" type="checkbox" :disabled="busy" /> 自动重连 (3s)</label>
    </details>
    <p v-if="mixedContent" class="warn">页面是 https，浏览器会拦截 ws:// —— 请改用 wss://</p>
    <p v-if="lastError" class="error">{{ lastError }}</p>
    <div class="row">
      <button v-if="!busy" class="primary" :disabled="!settings.url" @click="emit('connect')">连接</button>
      <button v-else @click="emit('disconnect')">断开</button>
    </div>
  </section>
</template>
