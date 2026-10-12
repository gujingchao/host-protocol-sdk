<script setup lang="ts">
import { computed, ref } from 'vue'
import { parseMqttMessage } from '../core/parsePayload'
import type { MqttMessage } from '../core/tagSample'

const emit = defineEmits<{ inject: [msg: MqttMessage] }>()
const topic = ref('factory/line1/telemetry')
const payload = ref('{"tag":"TEMP","value":36.5,"quality":"Good"}')

const result = computed(() => {
  const r = parseMqttMessage({ topic: topic.value, payload: new TextEncoder().encode(payload.value), receivedAt: new Date() })
  if (r.kind !== 'sample') return r
  const s = r.sample
  return { kind: r.kind, format: r.format, sample: { ...s, value: Number.isFinite(s.value) ? s.value : String(s.value), timestamp: s.timestamp.toISOString() } }
})

const examples = [
  '2.4',
  '{"tag":"TEMP","value":36.5}',
  '{"value":1,"quality":"Bad"}',
  '{"tag":"  ","value":7}',
  '{"value":1,"quality":null}',
  '{"value":"1.5"}',
  'NaN',
  '{"tag":"A","value":}',
]

function inject() {
  emit('inject', { topic: topic.value, payload: new TextEncoder().encode(payload.value), receivedAt: new Date() })
}
</script>

<template>
  <section class="panel">
    <h2>Payload 试验台</h2>
    <label class="field"><span>Topic</span><input v-model="topic" spellcheck="false" /></label>
    <label class="field"><span>Payload</span><textarea v-model="payload" rows="3" spellcheck="false"></textarea></label>
    <div class="presets">
      <button v-for="e in examples" :key="e" class="link mono" @click="payload = e">{{ e }}</button>
    </div>
    <pre class="result" :class="`k-${result.kind}`">{{ JSON.stringify(result, null, 2) }}</pre>
    <button :disabled="!topic" @click="inject">注入到监视器</button>
  </section>
</template>
