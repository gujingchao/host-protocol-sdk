namespace HostProtocol.Abstractions;

/// <summary>Thin MQTT client port so tests can fake the broker.</summary>
public interface IMqttClient : IAsyncDisposable
{
    bool IsConnected { get; }
    Task ConnectAsync(Uri brokerUri, CancellationToken cancellationToken = default);
    Task DisconnectAsync(CancellationToken cancellationToken = default);
    Task SubscribeAsync(string topic, CancellationToken cancellationToken = default);
    Task PublishAsync(string topic, ReadOnlyMemory<byte> payload, CancellationToken cancellationToken = default);
    /// <summary>Drain buffered messages for the given topic (or all if null).</summary>
    IReadOnlyList<MqttMessage> Drain(string? topic = null);
}

public sealed record MqttMessage(string Topic, byte[] Payload, DateTimeOffset ReceivedAt);
