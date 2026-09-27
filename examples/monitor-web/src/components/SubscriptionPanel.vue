<script setup lang="ts">
import { ref } from 'vue'
import type { Subscription } from '../composables/useMqttConnection'

const props = defineProps<{
  subscriptions: Subscription[]
  /** Returns a validation error, or null when added. */
  add: (filter: string, qos: 0 | 1 | 2) => string | null
}>()
const emit = defineEmits<{ remove: [filter: string] }>()

const draft = ref('')
const qos = ref<0 | 1 | 2>(0)
const err = ref<string | null>(null)

function submit() {
  err.value = props.add(draft.value, qos.value)
  if (!err.value) draft.value = ''
}
const stateText: Record<Subscription['state'], string> = { idle: '待连接', pending: '订阅中', subscribed: '已订阅', failed: '失败' }
</script>

<template>
  <section class="panel">
    <h2>订阅</h2>
    <form class="row" @submit.prevent="submit">
      <input v-model="draft" placeholder="factory/+/telemetry 或 #" spellcheck="false" />
      <select v-model.number="qos" title="QoS">
        <option :value="0">QoS0</option>
        <option :value="1">QoS1</option>
        <option :value="2">QoS2</option>
      </select>
      <button type="submit" :disabled="!draft.trim()">添加</button>
    </form>
    <p v-if="err" class="error">{{ err }}</p>
    <ul class="subs">
      <li v-for="s in subscriptions" :key="s.filter">
        <code>{{ s.filter }}</code>
        <span class="badge" :class="`sub-${s.state}`" :title="s.error">{{ stateText[s.state] }}</span>
        <small>QoS{{ s.qos }}</small>
        <button class="link" title="取消订阅" @click="emit('remove', s.filter)">✕</button>
      </li>
      <li v-if="subscriptions.length === 0" class="muted">暂无订阅</li>
    </ul>
    <p class="muted small">支持 <code>+</code> / <code>#</code> 通配符。默认值与 <code>MqttAdapterOptions.Topics</code> 相同。</p>
  </section>
</template>
