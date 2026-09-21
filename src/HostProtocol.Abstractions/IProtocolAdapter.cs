namespace HostProtocol.Abstractions;

/// <summary>Compatible with host-station AcquisitionHub polling model.</summary>
public interface IProtocolAdapter
{
    string Name { get; }
    Task ConnectAsync(CancellationToken cancellationToken = default);
    Task DisconnectAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<TagSample>> PollAsync(CancellationToken cancellationToken = default);
}

public sealed record TagSample(string Tag, double Value, DateTimeOffset Timestamp, string? Quality = null);
