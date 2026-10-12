/**
 * Small, dependency-free re-implementations of the .NET BCL behaviours that
 * MqttAdapter.TryParse relies on. Each one was checked against the real
 * .NET 8 runtime via the parity harness in `examples/monitor-web/parity/`.
 */

/**
 * Code points for which .NET `char.IsWhiteSpace` returns true.
 * (Used by `string.Trim()` and `string.IsNullOrWhiteSpace`.)
 *
 * Differs from JS `String.prototype.trim()`: .NET trims U+0085 (NEL) but NOT U+FEFF (BOM).
 */
const DOTNET_WHITESPACE = new Set<number>([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x0085, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
])

export function isDotnetWhiteSpace(ch: string): boolean {
  return DOTNET_WHITESPACE.has(ch.charCodeAt(0))
}

/** .NET `string.Trim()`. */
export function dotnetTrim(s: string): string {
  let start = 0
  let end = s.length
  while (start < end && DOTNET_WHITESPACE.has(s.charCodeAt(start))) start++
  while (end > start && DOTNET_WHITESPACE.has(s.charCodeAt(end - 1))) end--
  return s.slice(start, end)
}

/** .NET `string.IsNullOrWhiteSpace(s)`. */
export function isNullOrWhiteSpace(s: string | null | undefined): boolean {
  if (s == null) return true
  for (let i = 0; i < s.length; i++) {
    if (!DOTNET_WHITESPACE.has(s.charCodeAt(i))) return false
  }
  return true
}

/**
 * .NET `Encoding.UTF8.GetString(bytes)`: invalid sequences become U+FFFD and a
 * leading BOM is *kept* (only StreamReader strips the preamble), hence ignoreBOM.
 */
const utf8 = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true })
export function utf8GetString(payload: Uint8Array | string): string {
  if (typeof payload === 'string') return payload
  return utf8.decode(payload)
}

/**
 * NumberStyles.Float = AllowLeadingWhite | AllowTrailingWhite | AllowLeadingSign |
 * AllowDecimalPoint | AllowExponent. ASCII digits only, no thousands separator, no hex.
 * .NET also tolerates trailing U+0000 characters after the number.
 */
const FLOAT_STYLE = /^[\t\n\v\f\r ]*([+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)[\t\n\v\f\r ]*\0*$/

/** Only ASCII letters fold (OrdinalIgnoreCase does not map e.g. U+0131 to "i" here). */
function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32))
}

/**
 * `double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)`
 * on .NET Core 3.0+:
 *  - overflow yields ±Infinity (and succeeds), underflow yields 0;
 *  - the invariant symbols "Infinity", "-Infinity", "NaN" are accepted case-insensitively,
 *    plus "+Infinity", "+NaN", "-NaN".
 * Returns `undefined` when .NET would return false.
 */
export function dotnetTryParseDouble(text: string): number | undefined {
  const m = FLOAT_STYLE.exec(text)
  if (m) return Number(m[1])

  const t = asciiLower(dotnetTrim(text))
  switch (t) {
    case 'infinity':
    case '+infinity':
      return Number.POSITIVE_INFINITY
    case '-infinity':
      return Number.NEGATIVE_INFINITY
    case 'nan':
    case '+nan':
    case '-nan':
      return Number.NaN
    default:
      return undefined
  }
}

/** System.Text.Json `JsonDocumentOptions.MaxDepth` default. */
export const JSON_MAX_DEPTH = 64

/**
 * Maximum object/array nesting depth of a JSON text (brackets inside strings ignored).
 * Only meaningful for syntactically valid JSON; used to mirror JsonDocument's depth limit,
 * which JSON.parse does not have.
 */
export function jsonNestingDepth(text: string): number {
  let depth = 0
  let max = 0
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (inString) {
      if (c === 0x5c /* \ */) i++
      else if (c === 0x22 /* " */) inString = false
      continue
    }
    if (c === 0x22) inString = true
    else if (c === 0x7b /* { */ || c === 0x5b /* [ */) {
      depth++
      if (depth > max) max = depth
    } else if (c === 0x7d /* } */ || c === 0x5d /* ] */) depth--
  }
  return max
}

/** True when the string contains an unpaired UTF-16 surrogate (JsonElement.GetString throws on those). */
export function hasLoneSurrogate(s: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s)
}
