# host-protocol-sdk

Pluggable protocol adapters for [host-station](https://github.com/gujingchao/host-station) `AcquisitionHub`.

**Phase 0.1:** MQTT adapter + shared contracts. OPC-UA is a placeholder for phase 2.

## Packages

| Package | Role |
|---------|------|
| `HostProtocol.Abstractions` | `IProtocolAdapter`, `TagSample`, `IMqttClient` |
| `HostProtocol.Mqtt` | `MqttAdapter` + `InMemoryMqttClient` (tests/demo) |

## Quick start

```csharp
await using var client = new InMemoryMqttClient(); // swap for a real IMqttClient later
var adapter = new MqttAdapter(client, new MqttAdapterOptions
{
    Name = "mqtt-line-a",
    BrokerUri = new Uri("mqtt://localhost:1883"),
    Topics = ["factory/line1/temp"],
});
await adapter.ConnectAsync();
client.Inject("factory/line1/temp", """{"tag":"TEMP","value":36.5}""");
var samples = await adapter.PollAsync(); // feed into AcquisitionHub
```

Payloads: plain number, or JSON `{"tag","value","quality?"}`.

The receive buffer is bounded (default 10 000 messages, `DropOldest`) and each poll returns at most
`MaxBatchPerPoll` samples (default 1 000). See [docs/backpressure.md](docs/backpressure.md).

## Build / test

```bash
dotnet test HostProtocol.sln -c Release
```

## Scope

- Does **not** modify closed-source Hongqi projects.
- Designed to plug into host-station without forking its core.

## License

MIT
