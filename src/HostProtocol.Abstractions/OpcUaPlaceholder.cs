namespace HostProtocol.Abstractions;

/// <summary>OPC-UA adapter slot for phase 2 — not implemented in 0.1.</summary>
public interface IOpcUaAdapter : IProtocolAdapter
{
    Uri Endpoint { get; }
}
