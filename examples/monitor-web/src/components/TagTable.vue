<script setup lang="ts">
import { computed, ref } from 'vue'
import Sparkline from './Sparkline.vue'
import { classifyQuality } from '../core/quality'
import type { TagRow } from '../composables/useMonitor'

const props = defineProps<{ rows: TagRow[]; historySize: number }>()
const emit = defineEmits<{ remove: [tag: string] }>()

const filter = ref('')
const onlyNonGood = ref(false)
type SortKey = 'tag' | 'updated' | 'count'
const sortKey = ref<SortKey>('tag')

const view = computed(() => {
  const q = filter.value.trim().toLowerCase()
  const out = props.rows
    .map((r) => ({ ...r, level: classifyQuality(r.quality) }))
    .filter((r) => (!q || r.tag.toLowerCase().includes(q) || r.lastTopic.toLowerCase().includes(q)))
    .filter((r) => !onlyNonGood.value || r.level !== 'good')
  const cmp: Record<SortKey, (a: TagRow, b: TagRow) => number> = {
    tag: (a, b) => a.tag.localeCompare(b.tag),
    updated: (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    count: (a, b) => b.count - a.count,
  }
  return out.sort(cmp[sortKey.value])
})

const nonGoodCount = computed(() => props.rows.filter((r) => classifyQuality(r.quality) !== 'good').length)

function fmtValue(v: number): string {
  if (Number.isNaN(v)) return 'NaN'
  if (v === Infinity) return '+∞'
  if (v === -Infinity) return '−∞'
  if (Object.is(v, -0)) return '-0'
  const a = Math.abs(v)
  if (a !== 0 && (a >= 1e9 || a < 1e-4)) return v.toExponential(4)
  return String(+v.toFixed(6))
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}
</script>

<template>
  <section class="panel grow">
    <h2>
      Tags <small class="muted">({{ view.length }}/{{ rows.length }})</small>
      <span v-if="nonGoodCount" class="badge q-bad">{{ nonGoodCount }} 非 Good</span>
    </h2>
    <div class="row toolbar">
      <input v-model="filter" class="filter" placeholder="按 tag / topic 过滤…" spellcheck="false" />
      <label class="check"><input v-model="onlyNonGood" type="checkbox" /> 只看非 Good</label>
      <label class="check">
        排序
        <select v-model="sortKey">
          <option value="tag">Tag</option>
          <option value="updated">最近更新</option>
          <option value="count">更新次数</option>
        </select>
      </label>
    </div>
    <div class="table-wrap">
      <table class="tags">
        <thead>
          <tr>
            <th>Tag</th>
            <th class="num">最新值</th>
            <th>Quality</th>
            <th>Timestamp</th>
            <th class="num">更新数</th>
            <th>最近 {{ historySize }} 点</th>
            <th>Topic</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in view" :key="r.tag" :class="`row-${r.level}`">
            <td class="tag"><code>{{ r.tag }}</code></td>
            <td class="num value" :class="{ nonfinite: !Number.isFinite(r.value) }">{{ fmtValue(r.value) }}</td>
            <td>
              <span class="badge" :class="`q-${r.level}`">{{ r.quality === null ? 'null' : r.quality === '' ? '""' : r.quality }}</span>
            </td>
            <td class="mono" :title="r.timestamp.toISOString()">{{ fmtTime(r.timestamp) }}</td>
            <td class="num">{{ r.count }}</td>
            <td><Sparkline :points="r.history" :level="r.level" /></td>
            <td class="topic">
              <code>{{ r.lastTopic }}</code> <small class="muted">{{ r.lastFormat }}</small>
            </td>
            <td><button class="link" title="从表格移除（新消息到达时会重新出现）" @click="emit('remove', r.tag)">✕</button></td>
          </tr>
          <tr v-if="view.length === 0">
            <td colspan="8" class="muted empty">{{ rows.length ? '没有匹配过滤条件的 tag' : '尚无数据：连接 broker 并订阅主题，或开启演示模式' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
