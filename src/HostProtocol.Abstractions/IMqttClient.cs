namespace HostProtocol.Abstractions;

/// <summary>Thin MQTT client port so tests can fake the broker.</summary>
public interface IMqttClient : IAsyncDisposable
{
    bool IsConnected { get; }
    Task ConnectAsync(Uri brokerUri, CancellationToken cancellationToken = default);
    Task DisconnectAsync(CancellationToken cancellationToken = default);
    Task SubscribeAsync(string topic, CancellationToken cancellationToken = default);
    Task PublishAsync(string topic, ReadOnlyMemory<byte> payload, CancellationToken cancellationToken = default);
    /// <summary>
    /// Drain up to <paramref name="maxBatch"/> buffered messages in arrival order, for the given topic
    /// (or all if null). Implementations must buffer into a bounded store such as
    /// <see cref="BoundedMessageBuffer"/> so a burst cannot grow memory without limit.
    /// </summary>
    IReadOnlyList<MqttMessage> Drain(string? topic = null, int maxBatch = int.MaxValue);
    /// <summary>Receive-buffer counters (capacity, current depth, accepted, dropped).</summary>
    BufferStats BufferStats { get; }
}

public sealed record MqttMessage(string Topic, byte[] Payload, DateTimeOffset ReceivedAt);
