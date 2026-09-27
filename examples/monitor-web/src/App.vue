<script setup lang="ts">
import { computed } from 'vue'
import ConnectionPanel from './components/ConnectionPanel.vue'
import SubscriptionPanel from './components/SubscriptionPanel.vue'
import DemoPanel from './components/DemoPanel.vue'
import TagTable from './components/TagTable.vue'
import DroppedLog from './components/DroppedLog.vue'
import PayloadPlayground from './components/PayloadPlayground.vue'
import { useMonitor } from './composables/useMonitor'
import { useMqttConnection } from './composables/useMqttConnection'

const monitor = useMonitor()
const conn = useMqttConnection(monitor.ingest)
const filters = computed(() => conn.subscriptions.value.map((s) => s.filter))
const { rows, totals, dropped, rate, historySize } = monitor
</script>

<template>
  <header class="topbar">
    <div>
      <h1>HostProtocol Monitor</h1>
      <p class="muted small">MQTT over WebSocket → <code>TagSample</code>，解析规则与 <code>HostProtocol.Mqtt.MqttAdapter</code> 一致</p>
    </div>
    <dl class="stats">
      <div><dt>消息</dt><dd>{{ totals.messages }}</dd></div>
      <div><dt>样本</dt><dd>{{ totals.samples }}</dd></div>
      <div><dt>rejected</dt><dd :class="{ warnText: totals.rejected }">{{ totals.rejected }}</dd></div>
      <div><dt>error</dt><dd :class="{ errText: totals.errors }">{{ totals.errors }}</dd></div>
      <div><dt>Tags</dt><dd>{{ totals.tags }}</dd></div>
      <div><dt>msg/s</dt><dd>{{ rate }}</dd></div>
      <button class="link" title="清空所有 tag 与统计" @click="monitor.clearAll()">重置</button>
    </dl>
  </header>
  <main class="layout">
    <aside class="side">
      <ConnectionPanel
        :settings="conn.settings"
        :status="conn.status.value"
        :last-error="conn.lastError.value"
        @connect="conn.connect()"
        @disconnect="conn.disconnect()"
        @new-client-id="conn.newClientId()"
      />
      <SubscriptionPanel :subscriptions="conn.subscriptions.value" :add="conn.addSubscription" @remove="conn.removeSubscription" />
      <DemoPanel :filters="filters" @message="monitor.ingest" />
    </aside>
    <div class="content">
      <TagTable :rows="rows" :history-size="historySize" @remove="monitor.removeTag" />
      <div class="two-col">
        <DroppedLog :items="dropped" @clear="monitor.clearDropped()" />
        <PayloadPlayground @inject="monitor.ingest" />
      </div>
    </div>
  </main>
</template>
