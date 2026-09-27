using HostProtocol.Mqtt;
using Xunit;

namespace HostProtocol.Mqtt.Tests;

public class ParseErrorTests
{
    private static async Task<(InMemoryMqttClient Client, MqttAdapter Adapter)> CreateAsync()
    {
        var client = new InMemoryMqttClient();
        var adapter = new MqttAdapter(client, new MqttAdapterOptions
        {
            Name = "parse",
            BrokerUri = new Uri("mqtt://localhost:1883"),
            Topics = ["#"],
        });
        await adapter.ConnectAsync();
        return (client, adapter);
    }

    [Fact]
    public async Task Numeric_string_value_is_accepted()
    {
        var (client, adapter) = await CreateAsync();
        client.Inject("t", """{"tag":"A","value":"1.5"}""");
        var samples = await adapter.PollAsync();
        var s = Assert.Single(samples);
        Assert.Equal(1.5, s.Value, 3);
        Assert.Equal(0, adapter.ParseErrors);
    }

    [Theory]
    [InlineData("""{"tag":"A","value":"abc"}""")]
    [InlineData("""{"tag":"A","value":true}""")]
    [InlineData("""{"tag":"A","value":[1]}""")]
    [InlineData("""{"tag":"A","value":null}""")]
    [InlineData("""{"tag":"A"}""")]
    [InlineData("""{"tag":123,"value":1}""")]
    [InlineData("""{"tag":"A","value":1,"quality":5}""")]
    [InlineData("""{"tag":"A","value":"NaN"}""")]
    [InlineData("""{"tag":"A","value":"Infinity"}""")]
    [InlineData("""{not json""")]
    [InlineData("NaN")]
    [InlineData("hello")]
    public async Task Bad_message_is_skipped_alone_and_counted(string bad)
    {
        var (client, adapter) = await CreateAsync();
        client.Inject("t", "1");
        client.Inject("t", bad);
        client.Inject("t", """{"tag":"B","value":2}""");

        var samples = await adapter.PollAsync();

        Assert.Equal(2, samples.Count);
        Assert.Equal(1, adapter.ParseErrors);
        Assert.Equal(0, adapter.BufferStats.Dropped);
    }

    [Fact]
    public async Task Null_tag_falls_back_to_topic_and_null_quality_is_kept()
    {
        var (client, adapter) = await CreateAsync();
        client.Inject("line/temp", """{"tag":null,"value":3,"quality":null}""");
        var s = Assert.Single(await adapter.PollAsync());
        Assert.Equal("line/temp", s.Tag);
        Assert.Null(s.Quality);
        Assert.Equal(0, adapter.ParseErrors);
    }

    [Fact]
    public async Task ParseErrors_accumulate_across_polls()
    {
        var (client, adapter) = await CreateAsync();
        client.Inject("t", "x");
        await adapter.PollAsync();
        client.Inject("t", """{"value":"y"}""");
        await adapter.PollAsync();
        Assert.Equal(2, adapter.ParseErrors);
    }
}
