# monitor-web — MQTT TagSample 监视页（Vue 3 示例）

一个很小的 Vue 3 + TypeScript + Vite 单页应用：浏览器通过 **MQTT over WebSocket**（[mqtt.js](https://github.com/mqttjs/MQTT.js)）连接 broker，订阅主题，
把每条消息按 **与 `HostProtocol.Mqtt.MqttAdapter` 完全相同的规则** 解析成 `TagSample`，并实时展示。

它是一个示例/调试工具：在把 `MqttAdapter` 接进 host-station `AcquisitionHub` 之前，可以先用它确认现场设备发出的 payload 会被怎样解析、哪些会被丢弃。

## 功能

- **连接 / 断开**：broker URL 可在页面上修改（默认 `ws://localhost:8083/mqtt`，附 EMQX / Mosquitto 预设），显示连接状态与错误；可选用户名密码、MQTT 3.1.1 / 5.0、自动重连。
- **订阅管理**：增删主题订阅，支持 `+` / `#` 通配符（会做 MQTT 主题过滤器校验）；默认订阅 `factory/+/telemetry`，与 `MqttAdapterOptions.Topics` 的默认值一致。设置保存在 localStorage（密码不保存）。
- **Tag 表**：tag、最新值、quality、时间戳（毫秒）、更新次数、最后来源 topic；按 tag/topic 过滤、只看非 Good、排序。
- **Sparkline**：每个 tag 保留最近 200 个点（环形缓冲），用纯 SVG 画迷你折线，无图表库。NaN/±∞ 会使折线断开而不是拉坏坐标。
- **Quality 高亮**：`Bad*` 及其它非 Good 值红色、`Uncertain*` 黄色、JSON 显式 `null` 灰色。
- **被丢弃的消息**：列出 `MqttAdapter` 会丢弃（rejected）或会抛异常（error）的消息及原因。
- **Payload 试验台**：输入 topic + payload，实时看解析结果，可一键注入监视器。
- **演示模式**：不需要 broker，本地生成原始 payload（纯数字 + JSON，偶尔带 Bad/Uncertain 和非法 payload），与真实数据走同一个解析器。

## 运行

需要 Node.js 20.19+ 或 22.12+。

```bash
cd examples/monitor-web
npm install
npm run dev        # http://localhost:5173
npm run build      # 类型检查 (vue-tsc) + 产物输出到 dist/
npm test           # vitest 单元测试
```

不连 broker 也能直接点「开始演示」看效果。

## 搭配本地 broker

浏览器只能说 MQTT over **WebSocket**，所以 broker 必须开 WebSocket 监听（普通 1883 TCP 端口浏览器连不上）。

### Mosquitto

`mosquitto.conf`：

```conf
listener 1883
listener 9001
protocol websockets
allow_anonymous true
```

```bash
mosquitto -c mosquitto.conf
# 或 Docker：
docker run --rm -p 1883:1883 -p 9001:9001 \
  -v "$PWD/mosquitto.conf:/mosquitto/config/mosquitto.conf" eclipse-mosquitto:2
```

页面里 URL 填 `ws://localhost:9001`（点「Mosquitto 本地」预设即可）。

### EMQX

```bash
docker run --rm --name emqx -p 1883:1883 -p 8083:8083 -p 18083:18083 emqx/emqx:latest
```

EMQX 默认在 8083 端口提供 WebSocket，路径 `/mqtt`，即页面默认值 `ws://localhost:8083/mqtt`。管理台 http://localhost:18083。

### 发一些测试数据

```bash
# JSON：tag 取自 payload
mosquitto_pub -h localhost -t factory/line1/telemetry -m '{"tag":"TEMP","value":36.5,"quality":"Good"}'
mosquitto_pub -h localhost -t factory/line2/telemetry -m '{"tag":"PRESS","value":2.4,"quality":"Bad"}'
# 纯数字：tag = topic
mosquitto_pub -h localhost -t factory/line3/telemetry -m '12.5'
# 会被丢弃 / 会让 MqttAdapter 抛异常
mosquitto_pub -h localhost -t factory/line3/telemetry -m 'offline'
mosquitto_pub -h localhost -t factory/line3/telemetry -m '{"value":"12.5"}'

# 连续发正弦波
i=0; while true; do
  v=$(awk -v i=$i 'BEGIN{printf "%.2f", 36+2*sin(i/5)}')
  mosquitto_pub -h localhost -t factory/line1/telemetry -m "{\"tag\":\"TEMP\",\"value\":$v}"
  i=$((i+1)); sleep 0.5
done
```

如果页面是通过 https 打开的，浏览器会拦截 `ws://`，需要 broker 提供 `wss://`。

## 解析规则（对照 `MqttAdapter.TryParse`）

核心在 [`src/core/parsePayload.ts`](src/core/parsePayload.ts)（纯函数，无 Vue 依赖），类型镜像在 [`src/core/tagSample.ts`](src/core/tagSample.ts)：

```ts
interface TagSample { tag: string; value: number; timestamp: Date; quality: string | null }
```

| 输入 | 结果 |
|------|------|
| UTF-8 解码后 `.Trim()` 为空 | 丢弃 |
| 以 `{` 开头 → `JsonDocument.Parse` | 语法错误 / 嵌套超过 64 层 → 丢弃 |
| `"tag"` 缺失、`null`、空串或全空白 | tag = topic；非空白 tag 原样保留（不 trim） |
| `"value"` 缺失 | 丢弃 |
| `"quality"` 缺失 | `"Good"`；显式 `null` → `null`；其它字符串原样保留 |
| 其它 → `double.TryParse(Float, Invariant)` | 成功 → tag = topic，quality = `"Good"`；失败 → 丢弃 |
| timestamp | 永远是消息接收时间（`MqttMessage.ReceivedAt`），payload 里的时间字段被忽略 |

需要"解释"的 C# 行为（均已用真实 .NET 8 运行时验证）：

- **会抛异常的 payload**：`"tag"`/`"quality"` 不是字符串或 null（如 `{"tag":5,...}`），或 `"value"` 不是 JSON 数字（如 `{"value":"1.5"}`、`{"value":null}`），
  `JsonElement.GetString()` / `TryGetDouble()` 会抛 `InvalidOperationException`。C# 只捕获 `JsonException`，所以这会冲出 `PollAsync`，
  **整批已 Drain 的消息都会丢失**。本页面逐条处理，把它们标成 `error` 显示，而不是 `rejected`。求值顺序也一致：先 tag，再 value，最后 quality。
- **NaN / Infinity 是合法值**：纯文本 `NaN`、`nan`、`Infinity`、`-infinity`、`+Infinity` 以及溢出的 `1e400` 都会被 .NET 接受；JSON 中 `1e400` 同样得到 `Infinity`。
  页面照样显示（红色），sparkline 跳过这些点。
- **空白与 BOM**：用 .NET `char.IsWhiteSpace` 的集合做 Trim（包括 U+0085、U+3000，但**不**包括 U+FEFF）；`Encoding.UTF8.GetString` 不去 BOM，
  所以带 BOM 的 payload 会被丢弃。数字末尾的 `\0` 会被 .NET 容忍。
- **数字格式**：只接受 ASCII 数字、可选正负号、小数点、指数；不接受千分位、十六进制、全角数字、`,` 作小数点。
- JSON 属性名区分大小写（`"Tag"` 不算）；重复键以最后一个为准。

### 与 C# 的一致性测试

[`parity/`](parity/) 是一个小的 .NET 控制台程序：它用真实的 `InMemoryMqttClient` + `MqttAdapter.PollAsync` 跑 100+ 个 payload，
把结果写进 [`src/core/__fixtures__/mqttadapter-parity.json`](src/core/__fixtures__/mqttadapter-parity.json)，`parity.test.ts` 要求 TS 解析器逐条复现。
修改 `MqttAdapter.cs` 后重新生成（在仓库根目录执行）：

```bash
dotnet run --project examples/monitor-web/parity -- examples/monitor-web/src/core/__fixtures__/mqttadapter-parity.json
cd examples/monitor-web && npm test
```

## 与 C# 端的差异（刻意的）

- `MqttAdapter` 是轮询模型（`PollAsync` 批量 Drain），页面是推送模型（收到即解析），解析结果相同。
- 演示模式默认不受订阅限制（可勾选「只投递匹配当前订阅的演示主题」）。
- Quality 的 Good / Uncertain / Bad 分级只用于页面着色，`MqttAdapter` 把 quality 当作不透明字符串。

## 目录

```
src/
  core/                 纯 TS，可单测
    tagSample.ts        TagSample / MqttMessage 镜像类型
    parsePayload.ts     MqttAdapter.TryParse 的移植
    dotnet.ts           .NET Trim / double.TryParse / JsonDocument 深度限制等行为
    tagStore.ts         每个 tag 的最新值 + 环形缓冲历史
    demo.ts             演示数据生成器
    topicFilter.ts      MQTT 主题过滤器校验 / 匹配
    __tests__/          vitest
  composables/          mqtt.js 连接、监视器状态
  components/           表格、sparkline、面板
parity/                 生成一致性 fixture 的 .NET 程序
```
