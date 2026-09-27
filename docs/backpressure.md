# Receive buffer and backpressure

MQTT pushes messages through a receive callback, while host-station's `AcquisitionHub` pulls them
by calling `PollAsync` on a timer. The buffer between the two must be bounded, otherwise a broker
burst or a slow hub grows memory without limit and one poll can return tens of thousands of samples.

## What bounds what

| Knob | Where | Default | Effect |
|------|-------|---------|--------|
| `BoundedBufferOptions.Capacity` | `IMqttClient` implementation (ctor) | 10 000 | Max messages held between receive and poll |
| `BoundedBufferOptions.Policy` | same | `DropOldest` | Full buffer evicts the oldest (latest value wins) or rejects the newest |
| `MqttAdapterOptions.MaxBatchPerPoll` | `MqttAdapter` | 1 000 | Max messages turned into `TagSample`s per `PollAsync` |

`DropOldest` fits telemetry, where the current value matters more than a stale one. Use
`DropNewest` when the first messages of a burst matter more (for example, edge-triggered alarms),
and pair it with a larger capacity.

## Writing an `IMqttClient`

Keep the receive callback cheap: write into a `BoundedMessageBuffer` and return. Do not parse,
log per message, or await anything there. Implement `Drain(topic, maxBatch)` and `BufferStats`
by delegating to the buffer.

```csharp
public sealed class MyMqttClient : IMqttClient
{
    private readonly BoundedMessageBuffer _buffer;
    public MyMqttClient(BoundedBufferOptions? buffer = null) => _buffer = new(buffer);

    // in the library's message-received handler:
    //     _buffer.Write(new MqttMessage(topic, payload, DateTimeOffset.UtcNow));

    public IReadOnlyList<MqttMessage> Drain(string? topic = null, int maxBatch = int.MaxValue)
        => _buffer.Drain(topic, maxBatch);
    public BufferStats BufferStats => _buffer.Stats;
    // ...
}
```

## Sizing and monitoring

Pick `Capacity` of at least peak message rate times the worst poll interval you tolerate, and
`MaxBatchPerPoll` of at least steady-state rate times poll interval, so the buffer drains in normal
operation. Export `MqttAdapter.BufferStats` (`Count`, `Dropped`) as metrics: a rising `Dropped`
means the hub is polling too slowly or the batch cap is too small.
