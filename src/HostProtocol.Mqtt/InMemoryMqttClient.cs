using System.Collections.Concurrent;
using System.Text;
using HostProtocol.Abstractions;

namespace HostProtocol.Mqtt;

/// <summary>Test/demo MQTT client — no real broker required.</summary>
public sealed class InMemoryMqttClient : IMqttClient
{
    private readonly ConcurrentQueue<MqttMessage> _inbox = new();
    private readonly HashSet<string> _subs = new(StringComparer.Ordinal);
    private bool _connected;

    public bool IsConnected => _connected;

    public Task ConnectAsync(Uri brokerUri, CancellationToken cancellationToken = default)
    {
        _connected = true;
        return Task.CompletedTask;
    }

    public Task DisconnectAsync(CancellationToken cancellationToken = default)
    {
        _connected = false;
        return Task.CompletedTask;
    }

    public Task SubscribeAsync(string topic, CancellationToken cancellationToken = default)
    {
        EnsureConnected();
        _subs.Add(topic);
        return Task.CompletedTask;
    }

    public Task PublishAsync(string topic, ReadOnlyMemory<byte> payload, CancellationToken cancellationToken = default)
    {
        EnsureConnected();
        if (IsSubscribed(topic))
            _inbox.Enqueue(new MqttMessage(topic, payload.ToArray(), DateTimeOffset.UtcNow));
        return Task.CompletedTask;
    }

    /// <summary>Simulate an external publish into a subscribed topic.</summary>
    public void Inject(string topic, string payload)
    {
        if (IsSubscribed(topic))
            _inbox.Enqueue(new MqttMessage(topic, Encoding.UTF8.GetBytes(payload), DateTimeOffset.UtcNow));
    }

    public IReadOnlyList<MqttMessage> Drain(string? topic = null)
    {
        var kept = new List<MqttMessage>();
        var matched = new List<MqttMessage>();
        while (_inbox.TryDequeue(out var msg))
        {
            if (topic is null || msg.Topic == topic)
                matched.Add(msg);
            else
                kept.Add(msg);
        }
        foreach (var m in kept)
            _inbox.Enqueue(m);
        return matched;
    }

    public ValueTask DisposeAsync()
    {
        _connected = false;
        return ValueTask.CompletedTask;
    }

    private bool IsSubscribed(string topic) => _subs.Contains(topic) || _subs.Contains("#");

    private void EnsureConnected()
    {
        if (!_connected) throw new InvalidOperationException("MQTT client is not connected.");
    }
}
