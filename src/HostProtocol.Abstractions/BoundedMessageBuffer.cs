namespace HostProtocol.Abstractions;

/// <summary>What to do when a full buffer receives another message.</summary>
public enum OverflowPolicy
{
    /// <summary>Evict the oldest buffered message and keep the new one (telemetry: latest value wins).</summary>
    DropOldest,
    /// <summary>Reject the new message and keep what is already buffered.</summary>
    DropNewest,
}

public sealed class BoundedBufferOptions
{
    public int Capacity { get; init; } = 10_000;
    public OverflowPolicy Policy { get; init; } = OverflowPolicy.DropOldest;
}

/// <summary>Point-in-time buffer counters. Enqueued counts accepted writes; Dropped counts evicted or rejected ones.</summary>
public readonly record struct BufferStats(int Capacity, int Count, long Enqueued, long Dropped);

/// <summary>
/// Thread-safe bounded FIFO between a push source (MQTT receive callback) and a pull consumer
/// (AcquisitionHub polling). Memory is capped at <see cref="Capacity"/> messages no matter how fast
/// the broker publishes or how slowly the hub polls.
/// </summary>
public sealed class BoundedMessageBuffer
{
    private readonly Queue<MqttMessage> _queue;
    private readonly object _gate = new();
    private long _enqueued;
    private long _dropped;

    public BoundedMessageBuffer(BoundedBufferOptions? options = null)
    {
        options ??= new BoundedBufferOptions();
        if (options.Capacity <= 0)
            throw new ArgumentOutOfRangeException(nameof(options), "Capacity must be positive.");
        Capacity = options.Capacity;
        Policy = options.Policy;
        _queue = new Queue<MqttMessage>(Math.Min(Capacity, 1024));
    }

    public int Capacity { get; }
    public OverflowPolicy Policy { get; }

    /// <summary>Writes a message. Returns false only when DropNewest rejected it.</summary>
    public bool Write(MqttMessage message)
    {
        ArgumentNullException.ThrowIfNull(message);
        lock (_gate)
        {
            if (_queue.Count >= Capacity)
            {
                _dropped++;
                if (Policy == OverflowPolicy.DropNewest)
                    return false;
                _queue.Dequeue();
            }
            _queue.Enqueue(message);
            _enqueued++;
            return true;
        }
    }

    /// <summary>
    /// Removes up to <paramref name="maxBatch"/> messages in arrival order, optionally only those on
    /// <paramref name="topic"/> (exact match; other topics stay buffered in order).
    /// </summary>
    public IReadOnlyList<MqttMessage> Drain(string? topic = null, int maxBatch = int.MaxValue)
    {
        if (maxBatch <= 0)
            throw new ArgumentOutOfRangeException(nameof(maxBatch), "maxBatch must be positive.");
        lock (_gate)
        {
            if (_queue.Count == 0)
                return Array.Empty<MqttMessage>();

            var take = Math.Min(maxBatch, _queue.Count);
            var result = new List<MqttMessage>(topic is null ? take : Math.Min(take, 64));
            if (topic is null)
            {
                for (var i = 0; i < take; i++)
                    result.Add(_queue.Dequeue());
                return result;
            }

            // One rotation keeps the relative order of skipped messages.
            var n = _queue.Count;
            for (var i = 0; i < n; i++)
            {
                var msg = _queue.Dequeue();
                if (result.Count < maxBatch && msg.Topic == topic)
                    result.Add(msg);
                else
                    _queue.Enqueue(msg);
            }
            return result;
        }
    }

    public BufferStats Stats
    {
        get
        {
            lock (_gate)
                return new BufferStats(Capacity, _queue.Count, _enqueued, _dropped);
        }
    }
}
