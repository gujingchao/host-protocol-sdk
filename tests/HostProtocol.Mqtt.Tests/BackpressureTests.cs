using System.Text;
using HostProtocol.Abstractions;
using HostProtocol.Mqtt;
using Xunit;

namespace HostProtocol.Mqtt.Tests;

public class BackpressureTests
{
    private static MqttMessage Msg(string topic, int i) =>
        new(topic, Encoding.UTF8.GetBytes(i.ToString()), DateTimeOffset.UtcNow);

    [Fact]
    public void DropOldest_keeps_latest_messages()
    {
        var buf = new BoundedMessageBuffer(new BoundedBufferOptions { Capacity = 3, Policy = OverflowPolicy.DropOldest });
        for (var i = 1; i <= 5; i++)
            Assert.True(buf.Write(Msg("t", i)));

        var drained = buf.Drain();
        Assert.Equal(new[] { "3", "4", "5" }, drained.Select(m => Encoding.UTF8.GetString(m.Payload)));
        Assert.Equal(new BufferStats(3, 0, 5, 2), buf.Stats);
    }

    [Fact]
    public void DropNewest_rejects_when_full()
    {
        var buf = new BoundedMessageBuffer(new BoundedBufferOptions { Capacity = 3, Policy = OverflowPolicy.DropNewest });
        var accepted = Enumerable.Range(1, 5).Select(i => buf.Write(Msg("t", i))).ToArray();

        Assert.Equal(new[] { true, true, true, false, false }, accepted);
        Assert.Equal(new[] { "1", "2", "3" }, buf.Drain().Select(m => Encoding.UTF8.GetString(m.Payload)));
        Assert.Equal(new BufferStats(3, 0, 3, 2), buf.Stats);
    }

    [Fact]
    public void Drain_respects_maxBatch_and_topic_filter_preserves_order()
    {
        var buf = new BoundedMessageBuffer(new BoundedBufferOptions { Capacity = 100 });
        for (var i = 0; i < 10; i++)
            buf.Write(Msg(i % 2 == 0 ? "a" : "b", i));

        var a = buf.Drain("a", maxBatch: 3);
        Assert.Equal(new[] { "0", "2", "4" }, a.Select(m => Encoding.UTF8.GetString(m.Payload)));

        var rest = buf.Drain();
        Assert.Equal(new[] { "1", "3", "5", "6", "7", "8", "9" }, rest.Select(m => Encoding.UTF8.GetString(m.Payload)));
        Assert.Throws<ArgumentOutOfRangeException>(() => buf.Drain(maxBatch: 0));
    }

    [Theory]
    [InlineData(OverflowPolicy.DropOldest)]
    [InlineData(OverflowPolicy.DropNewest)]
    public async Task Concurrent_writers_never_exceed_capacity_and_counters_balance(OverflowPolicy policy)
    {
        const int writers = 8, perWriter = 10_000, capacity = 1_000;
        var buf = new BoundedMessageBuffer(new BoundedBufferOptions { Capacity = capacity, Policy = policy });
        long drained = 0;
        using var cts = new CancellationTokenSource();

        var consumer = Task.Run(async () =>
        {
            while (!cts.IsCancellationRequested)
            {
                Interlocked.Add(ref drained, buf.Drain(maxBatch: 200).Count);
                Assert.True(buf.Stats.Count <= capacity);
                await Task.Yield();
            }
        });

        await Task.WhenAll(Enumerable.Range(0, writers).Select(w => Task.Run(() =>
        {
            for (var i = 0; i < perWriter; i++) buf.Write(Msg($"w{w}", i));
        })));
        cts.Cancel();
        await consumer;
        drained += buf.Drain().Count;

        var s = buf.Stats;
        Assert.Equal(0, s.Count);
        // Every write was either accepted or rejected; every accepted message was drained or evicted.
        if (policy == OverflowPolicy.DropNewest)
        {
            Assert.Equal(writers * perWriter, s.Enqueued + s.Dropped);
            Assert.Equal(s.Enqueued, drained);
        }
        else
        {
            Assert.Equal(writers * perWriter, s.Enqueued);
            Assert.Equal(s.Enqueued, drained + s.Dropped);
        }
    }

    [Fact]
    public async Task Adapter_burst_is_capped_by_buffer_and_batched_per_poll()
    {
        await using var client = new InMemoryMqttClient(new BoundedBufferOptions { Capacity = 1_000 });
        var adapter = new MqttAdapter(client, new MqttAdapterOptions
        {
            Name = "burst",
            BrokerUri = new Uri("mqtt://localhost:1883"),
            Topics = ["factory/line1/temp"],
            MaxBatchPerPoll = 300,
        });
        await adapter.ConnectAsync();

        for (var i = 0; i < 5_000; i++)
            client.Inject("factory/line1/temp", i.ToString());
        Assert.Equal(new BufferStats(1_000, 1_000, 5_000, 4_000), adapter.BufferStats);

        var sizes = new List<int>();
        var all = new List<TagSample>();
        IReadOnlyList<TagSample> batch;
        while ((batch = await adapter.PollAsync()).Count > 0)
        {
            sizes.Add(batch.Count);
            all.AddRange(batch);
        }

        Assert.Equal(new[] { 300, 300, 300, 100 }, sizes);
        // DropOldest default: the newest 1000 values survive, in order.
        Assert.Equal(Enumerable.Range(4_000, 1_000).Select(i => (double)i), all.Select(s => s.Value));
    }
}
