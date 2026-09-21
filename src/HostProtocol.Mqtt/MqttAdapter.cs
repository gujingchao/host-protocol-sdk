using System.Globalization;
using System.Text;
using System.Text.Json;
using HostProtocol.Abstractions;

namespace HostProtocol.Mqtt;

public sealed class MqttAdapterOptions
{
    public required string Name { get; init; }
    public required Uri BrokerUri { get; init; }
    /// <summary>Topics to subscribe; each message maps to a tag (topic path or JSON "tag"/"value").</summary>
    public IReadOnlyList<string> Topics { get; init; } = ["factory/+/telemetry"];
}

/// <summary>
/// MQTT → TagSample adapter for AcquisitionHub.
/// Payload: plain number, or JSON {"tag":"...","value":1.23,"quality":"Good"}.
/// </summary>
public sealed class MqttAdapter : IProtocolAdapter
{
    private readonly IMqttClient _client;
    private readonly MqttAdapterOptions _options;
    private bool _connected;

    public MqttAdapter(IMqttClient client, MqttAdapterOptions options)
    {
        _client = client;
        _options = options;
    }

    public string Name => _options.Name;

    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        await _client.ConnectAsync(_options.BrokerUri, cancellationToken).ConfigureAwait(false);
        foreach (var topic in _options.Topics)
            await _client.SubscribeAsync(topic, cancellationToken).ConfigureAwait(false);
        _connected = true;
    }

    public async Task DisconnectAsync(CancellationToken cancellationToken = default)
    {
        await _client.DisconnectAsync(cancellationToken).ConfigureAwait(false);
        _connected = false;
    }

    public Task<IReadOnlyList<TagSample>> PollAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!_connected)
            throw new InvalidOperationException($"{Name} is not connected.");

        var messages = _client.Drain();
        var samples = new List<TagSample>(messages.Count);
        foreach (var msg in messages)
        {
            if (TryParse(msg, out var sample))
                samples.Add(sample);
        }
        return Task.FromResult<IReadOnlyList<TagSample>>(samples);
    }

    private static bool TryParse(MqttMessage msg, out TagSample sample)
    {
        sample = null!;
        var text = Encoding.UTF8.GetString(msg.Payload).Trim();
        if (text.Length == 0) return false;

        if (text.StartsWith('{'))
        {
            try
            {
                using var doc = JsonDocument.Parse(text);
                var root = doc.RootElement;
                var tag = root.TryGetProperty("tag", out var t) ? t.GetString() : msg.Topic;
                if (string.IsNullOrWhiteSpace(tag)) tag = msg.Topic;
                if (!root.TryGetProperty("value", out var v) || !v.TryGetDouble(out var value))
                    return false;
                var quality = root.TryGetProperty("quality", out var q) ? q.GetString() : "Good";
                sample = new TagSample(tag!, value, msg.ReceivedAt, quality);
                return true;
            }
            catch (JsonException)
            {
                return false;
            }
        }

        if (double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var plain))
        {
            sample = new TagSample(msg.Topic, plain, msg.ReceivedAt, "Good");
            return true;
        }
        return false;
    }
}
