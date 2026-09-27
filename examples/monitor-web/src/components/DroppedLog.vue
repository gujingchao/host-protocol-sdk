<script setup lang="ts">
import type { DroppedMessage } from '../core/tagStore'

defineProps<{ items: DroppedMessage[] }>()
const emit = defineEmits<{ clear: [] }>()
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
</script>

<template>
  <section class="panel">
    <h2>
      被丢弃的消息 <small class="muted">({{ items.length }})</small>
      <button v-if="items.length" class="link right" @click="emit('clear')">清空</button>
    </h2>
    <p class="muted small">
      <span class="badge k-rejected">rejected</span> = <code>TryParse</code> 返回 false，MqttAdapter 静默丢弃；
      <span class="badge k-error">error</span> = MqttAdapter 会抛 <code>InvalidOperationException</code>（整批 PollAsync 失败）。
    </p>
    <ul class="dropped">
      <li v-for="(d, i) in items" :key="i">
        <span class="badge" :class="`k-${d.kind}`">{{ d.kind }}</span>
        <span class="mono muted">{{ fmtTime(d.at) }}</span>
        <code>{{ d.topic }}</code>
        <pre>{{ d.payloadPreview === '' ? '(empty)' : d.payloadPreview }}</pre>
        <small>{{ d.reason }}</small>
      </li>
      <li v-if="items.length === 0" class="muted">暂无</li>
    </ul>
  </section>
</template>
