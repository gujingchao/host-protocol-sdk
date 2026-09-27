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
    /// <summary>
    /// Upper bound on messages taken from the client per <see cref="MqttAdapter.PollAsync"/>, so one poll
    /// never hands AcquisitionHub an unbounded batch after a burst. Buffer size and overflow policy
    /// are configured on the <see cref="IMqttClient"/> (see <see cref="BoundedBufferOptions"/>).
    /// </summary>
    public int MaxBatchPerPoll { get; init; } = 1_000;
}

/// <summary>
/// MQTT → TagSample adapter for AcquisitionHub.
/// Payload: plain number, or JSON {"tag":"...","value":1.23,"quality":"Good"}; "value" may also be a numeric string.
/// Malformed messages are skipped one by one and counted in <see cref="ParseErrors"/>.
/// </summary>
public sealed class MqttAdapter : IProtocolAdapter
{
    private readonly IMqttClient _client;
    private readonly MqttAdapterOptions _options;
    private bool _connected;
    private long _parseErrors;

    public MqttAdapter(IMqttClient client, MqttAdapterOptions options)
    {
        if (options.MaxBatchPerPoll <= 0)
            throw new ArgumentOutOfRangeException(nameof(options), "MaxBatchPerPoll must be positive.");
        _client = client;
        _options = options;
    }

    public string Name => _options.Name;

    /// <summary>Receive-buffer counters from the underlying client (watch Dropped for backpressure).</summary>
    public BufferStats BufferStats => _client.BufferStats;

    /// <summary>
    /// Messages skipped because the payload was malformed (bad JSON, wrong field types, non-numeric or
    /// non-finite value). Separate from <see cref="BufferStats"/>.Dropped, which counts backpressure loss.
    /// A bad message is skipped on its own; the rest of the batch is still returned.
    /// </summary>
    public long ParseErrors => Interlocked.Read(ref _parseErrors);

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

        var messages = _client.Drain(maxBatch: _options.MaxBatchPerPoll);
        var samples = new List<TagSample>(messages.Count);
        foreach (var msg in messages)
        {
            if (TryParse(msg, out var sample))
                samples.Add(sample);
            else
                Interlocked.Increment(ref _parseErrors);
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
                if (root.ValueKind != JsonValueKind.Object) return false;

                if (!TryReadOptionalString(root, "tag", msg.Topic, out var tag, nullResult: msg.Topic)) return false;
                if (string.IsNullOrWhiteSpace(tag)) tag = msg.Topic;
                if (!root.TryGetProperty("value", out var v) || !TryReadNumber(v, out var value)) return false;
                if (!TryReadOptionalString(root, "quality", "Good", out var quality, nullResult: null)) return false;

                sample = new TagSample(tag!, value, msg.ReceivedAt, quality);
                return true;
            }
            catch (JsonException)
            {
                return false;
            }
        }

        if (TryParseFinite(text, out var plain))
        {
            sample = new TagSample(msg.Topic, plain, msg.ReceivedAt, "Good");
            return true;
        }
        return false;
    }

    /// <summary>Number, or a numeric string such as "1.5" (InvariantCulture). Anything else is a parse error.</summary>
    private static bool TryReadNumber(JsonElement v, out double value)
    {
        value = 0;
        return v.ValueKind switch
        {
            JsonValueKind.Number => v.TryGetDouble(out value) && double.IsFinite(value),
            JsonValueKind.String => TryParseFinite(v.GetString()!, out value),
            _ => false,
        };
    }

    /// <summary>Missing uses <paramref name="fallback"/>, JSON null uses <paramref name="nullResult"/>,
    /// a string is used as-is; any other JSON kind is a parse error.</summary>
    private static bool TryReadOptionalString(JsonElement root, string name, string fallback, out string? result, string? nullResult)
    {
        result = fallback;
        if (!root.TryGetProperty(name, out var e)) return true;
        switch (e.ValueKind)
        {
            case JsonValueKind.Null:
                result = nullResult;
                return true;
            case JsonValueKind.String:
                result = e.GetString()!;
                return true;
            default:
                return false;
        }
    }

    private static bool TryParseFinite(string text, out double value) =>
        double.TryParse(text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out value) && double.IsFinite(value);
}
