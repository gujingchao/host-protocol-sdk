<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { DemoGenerator, DEMO_TOPICS } from '../core/demo'
import { topicMatches } from '../core/topicFilter'
import type { MqttMessage } from '../core/tagSample'

const props = defineProps<{ filters: string[] }>()
const emit = defineEmits<{ message: [msg: MqttMessage] }>()

const running = ref(false)
const intervalMs = ref(500)
const badRate = ref(0.03)
const respectSubs = ref(false)
let gen: DemoGenerator | null = null
let timer: ReturnType<typeof setInterval> | undefined

function tick() {
  if (!gen) return
  for (const m of gen.next()) {
    if (respectSubs.value && !props.filters.some((f) => topicMatches(f, m.topic))) continue
    emit('message', m)
  }
}

function start() {
  stop()
  gen ??= new DemoGenerator({ badPayloadRate: badRate.value })
  timer = setInterval(tick, intervalMs.value)
  running.value = true
}
function stop() {
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
  running.value = false
}
watch(intervalMs, () => running.value && start())
watch(badRate, (r) => {
  gen = new DemoGenerator({ badPayloadRate: r })
})
onBeforeUnmount(stop)
</script>

<template>
  <section class="panel">
    <h2>
      演示模式
      <span v-if="running" class="status status-connected">● 运行中</span>
    </h2>
    <p class="muted small">
      本地生成原始 MQTT payload（纯数字 + JSON，偶尔带 Bad/Uncertain 质量和非法 payload），与 broker 数据走同一个解析器。无需 broker。
    </p>
    <div class="row">
      <label class="check">
        间隔
        <select v-model.number="intervalMs">
          <option :value="100">100 ms</option>
          <option :value="250">250 ms</option>
          <option :value="500">500 ms</option>
          <option :value="1000">1 s</option>
        </select>
      </label>
      <label class="check">
        非法 payload
        <select v-model.number="badRate">
          <option :value="0">0%</option>
          <option :value="0.03">3%</option>
          <option :value="0.2">20%</option>
        </select>
      </label>
    </div>
    <label class="check" :title="DEMO_TOPICS.join('\n')"><input v-model="respectSubs" type="checkbox" /> 只投递匹配当前订阅的演示主题</label>
    <div class="row">
      <button v-if="!running" class="primary" @click="start">开始演示</button>
      <button v-else @click="stop">停止演示</button>
    </div>
  </section>
</template>
