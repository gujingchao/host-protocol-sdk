using Xunit;
using HostProtocol.Mqtt;

namespace HostProtocol.Mqtt.Tests;

public class MqttAdapterTests
{
    [Fact]
    public async Task Poll_parses_json_and_plain_payloads()
    {
        await using var client = new InMemoryMqttClient();
        var adapter = new MqttAdapter(client, new MqttAdapterOptions
        {
            Name = "mqtt-line-a",
            BrokerUri = new Uri("mqtt://localhost:1883"),
            Topics = ["factory/line1/temp", "factory/line1/press"],
        });

        await adapter.ConnectAsync();
        client.Inject("factory/line1/temp", """{"tag":"TEMP","value":36.5,"quality":"Good"}""");
        client.Inject("factory/line1/press", "2.4");

        var samples = await adapter.PollAsync();
        Assert.Equal(2, samples.Count);
        Assert.Contains(samples, s => s.Tag == "TEMP" && Math.Abs(s.Value - 36.5) < 0.001);
        Assert.Contains(samples, s => s.Tag == "factory/line1/press" && Math.Abs(s.Value - 2.4) < 0.001);
    }

    [Fact]
    public async Task Poll_before_connect_throws()
    {
        await using var client = new InMemoryMqttClient();
        var adapter = new MqttAdapter(client, new MqttAdapterOptions
        {
            Name = "x",
            BrokerUri = new Uri("mqtt://localhost:1883"),
        });
        await Assert.ThrowsAsync<InvalidOperationException>(() => adapter.PollAsync());
    }
}
