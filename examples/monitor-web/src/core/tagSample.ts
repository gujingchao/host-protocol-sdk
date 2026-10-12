/**
 * TypeScript mirrors of the C# contracts in `src/HostProtocol.Abstractions`.
 *
 * C#:
 *   public sealed record TagSample(string Tag, double Value, DateTimeOffset Timestamp, string? Quality = null);
 *   public sealed record MqttMessage(string Topic, byte[] Payload, DateTimeOffset ReceivedAt);
 */

/** Mirror of `HostProtocol.Abstractions.TagSample`. */
export interface TagSample {
  /** `Tag` — JSON "tag" (if a non-blank string) or the MQTT topic. */
  readonly tag: string
  /** `Value` — IEEE-754 double. NaN / ±Infinity are possible (see parsePayload.ts). */
  readonly value: number
  /** `Timestamp` — always the message's ReceivedAt, never read from the payload. */
  readonly timestamp: Date
  /** `Quality` — "Good" by default; JSON may override it, and an explicit JSON null yields null. */
  readonly quality: string | null
}

/** Mirror of `HostProtocol.Abstractions.MqttMessage`. */
export interface MqttMessage {
  readonly topic: string
  /** Raw payload bytes (mqtt.js hands us a Buffer, which is a Uint8Array). A string is UTF-8 encoded first. */
  readonly payload: Uint8Array | string
  readonly receivedAt: Date
}

/** The quality string MqttAdapter assigns when the payload does not carry one. */
export const DEFAULT_QUALITY = 'Good'
