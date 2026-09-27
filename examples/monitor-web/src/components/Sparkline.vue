<script setup lang="ts">
import { computed } from 'vue'
import type { HistoryPoint } from '../core/tagStore'
import type { QualityLevel } from '../core/quality'

const props = withDefaults(
  defineProps<{ points: HistoryPoint[]; level?: QualityLevel; width?: number; height?: number }>(),
  { level: 'good', width: 140, height: 28 },
)

const PAD = 2

/** Plain SVG path; NaN/±Infinity samples (legal TagSample values) break the line instead of distorting the scale. */
const geom = computed(() => {
  const pts = props.points
  const finite = pts.filter((p) => Number.isFinite(p.v))
  if (finite.length === 0) return null
  let min = Infinity
  let max = -Infinity
  for (const p of finite) {
    if (p.v < min) min = p.v
    if (p.v > max) max = p.v
  }
  const w = props.width - PAD * 2
  const h = props.height - PAD * 2
  const span = max - min || 1
  const n = Math.max(pts.length - 1, 1)
  const x = (i: number) => PAD + (i / n) * w
  const y = (v: number) => (max === min ? PAD + h / 2 : PAD + h - ((v - min) / span) * h)

  let d = ''
  let pen = false
  let last: { x: number; y: number } | null = null
  pts.forEach((p, i) => {
    if (!Number.isFinite(p.v)) {
      pen = false
      return
    }
    const px = x(i).toFixed(1)
    const py = y(p.v).toFixed(1)
    d += `${pen ? 'L' : 'M'}${px} ${py}`
    pen = true
    last = { x: +px, y: +py }
  })
  const gaps = pts.length - finite.length
  return { d, min, max, last: last as { x: number; y: number } | null, gaps }
})

const fmt = (v: number) => (Math.abs(v) >= 1e5 || (v !== 0 && Math.abs(v) < 1e-3) ? v.toExponential(3) : +v.toFixed(4))
</script>

<template>
  <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" class="spark" :class="`spark-${level}`" role="img">
    <title v-if="geom">
      {{ points.length }} 点 · min {{ fmt(geom.min) }} · max {{ fmt(geom.max) }}{{ geom.gaps ? ` · ${geom.gaps} 个非有限值` : '' }}
    </title>
    <template v-if="geom">
      <path :d="geom.d" fill="none" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" />
      <circle v-if="geom.last" :cx="geom.last.x" :cy="geom.last.y" r="2" />
    </template>
    <text v-else x="4" :y="height / 2 + 4" class="spark-empty">no finite data</text>
  </svg>
</template>
