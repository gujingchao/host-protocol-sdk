// Parity harness: runs a list of payloads through the REAL HostProtocol.Mqtt.MqttAdapter
// (InMemoryMqttClient + PollAsync) and writes the outcomes as a JSON fixture that the
// TypeScript parser tests (src/core/__tests__/parity.test.ts) must reproduce exactly.
//
//   dotnet run --project examples/monitor-web/parity -- examples/monitor-web/src/core/__fixtures__/mqttadapter-parity.json
//
// kind: "sample" (TryParse true) | "rejected" (TryParse false) | "error" (PollAsync threw).
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using HostProtocol.Mqtt;

string T = "factory/line1/press";
string deep(int n) => new string('[', n - 1).Insert(0, "{\"value\":1,\"x\":") + new string(']', n - 1) + "}";
var cases = new List<(string name, string topic, byte[] payload)>();
void S(string name, string p, string? topic = null) => cases.Add((name, topic ?? T, Encoding.UTF8.GetBytes(p)));
void B(string name, byte[] p) => cases.Add((name, T, p));

S("plain integer", "42");
S("plain decimal", "2.4");
S("plain negative", "-1.5");
S("plain leading plus", "+2");
S("plain leading dot", ".5");
S("plain trailing dot", "5.");
S("plain exponent", "1e3");
S("plain exponent upper signed", "1.5E-3");
S("plain surrounded by whitespace", "  \t3.25\r\n");
S("plain with NEL/NBSP around (.NET whitespace)", "\u0085\u00A07\u00A0");
S("plain with trailing NUL chars", "12\0\0");
S("plain NaN", "NaN");
S("plain nan lowercase", "nan");
S("plain Infinity", "Infinity");
S("plain -infinity lowercase", "-infinity");
S("plain +Infinity", "+Infinity");
S("plain -NaN", "-NaN");
S("plain overflow 1e400", "1e400");
S("plain infinity symbol", "\u221E");
S("plain hex rejected", "0x10");
S("plain thousands rejected", "1,000");
S("plain underscore rejected", "1_000");
S("plain two dots rejected", "1.2.3");
S("plain dangling exponent rejected", "1e");
S("plain lone dot rejected", ".");
S("plain lone sign rejected", "-");
S("plain inner space rejected", "1 2");
S("plain comma decimal rejected", "2,5");
S("plain text rejected", "hello");
S("plain true rejected", "true");
S("empty payload", "");
S("whitespace-only payload", "  \r\n ");
B("BOM + number (BOM not stripped)", new byte[] { 0xEF, 0xBB, 0xBF, (byte)'1', (byte)'2' });
B("BOM + JSON (BOM not stripped)", Encoding.UTF8.GetBytes("\uFEFF{\"value\":1}"));
B("invalid UTF-8 bytes", new byte[] { 0xFF, 0xFE, (byte)'1' });
S("json full", "{\"tag\":\"TEMP\",\"value\":36.5,\"quality\":\"Good\"}");
S("json no quality -> Good", "{\"tag\":\"TEMP\",\"value\":36.5}");
S("json custom quality", "{\"tag\":\"TEMP\",\"value\":1,\"quality\":\"Bad\"}");
S("json quality null -> null", "{\"tag\":\"TEMP\",\"value\":1,\"quality\":null}");
S("json quality empty string kept", "{\"tag\":\"TEMP\",\"value\":1,\"quality\":\"\"}");
S("json no tag -> topic", "{\"value\":7}");
S("json tag null -> topic", "{\"tag\":null,\"value\":7}");
S("json tag empty -> topic", "{\"tag\":\"\",\"value\":7}");
S("json tag whitespace -> topic", "{\"tag\":\"  \",\"value\":7}");
S("json tag not trimmed", "{\"tag\":\" A \",\"value\":7}");
S("json keys case-sensitive (Tag/Value ignored)", "{\"Tag\":\"A\",\"Value\":7}");
S("json key Tag ignored but value ok", "{\"Tag\":\"A\",\"value\":7}");
S("json duplicate keys last wins", "{\"tag\":\"A\",\"tag\":\"B\",\"value\":1,\"value\":2}");
S("json extra fields ignored", "{\"tag\":\"A\",\"value\":1,\"unit\":\"C\",\"ts\":123}");
S("json leading whitespace", "   {\"value\":3}");
S("json integer value", "{\"value\":10}");
S("json negative exponent value", "{\"value\":-1.5e-2}");
S("json negative zero", "{\"value\":-0}");
S("json missing value rejected", "{\"tag\":\"A\"}");
S("json value overflow -> Infinity", "{\"value\":1e400}");
S("json empty object rejected", "{}");
S("json value string throws", "{\"tag\":\"A\",\"value\":\"1.5\"}");
S("json value null throws", "{\"value\":null}");
S("json value bool throws", "{\"value\":true}");
S("json value object throws", "{\"value\":{}}");
S("json tag number throws", "{\"tag\":5,\"value\":1}");
S("json tag number throws even without value", "{\"tag\":5}");
S("json quality number throws", "{\"value\":1,\"quality\":192}");
S("json quality number but no value rejected", "{\"quality\":192}");
S("json malformed rejected", "{\"tag\":\"A\",\"value\":}");
S("json truncated rejected", "{\"tag\":\"A\",\"value\":1");
S("json trailing comma rejected", "{\"value\":1,}");
S("json comment rejected", "{\"value\":1 /* c */}");
S("json single quotes rejected", "{'value':1}");
S("json trailing garbage rejected", "{\"value\":1} x");
S("json two objects rejected", "{\"value\":1}{\"value\":2}");
S("json NaN literal rejected", "{\"value\":NaN}");
S("json leading zero rejected", "{\"value\":01}");
S("json array root not treated as json", "[1]");
S("json depth 64 ok", deep(64));
S("json depth 65 rejected", deep(65));
S("quoted number is not JSON path", "\"12\"");

S("plain negative zero", "-0");
S("plain leading zeros", "00012");
S("plain underflow -> 0", "1e-400");
S("plain ideographic space around", "\u30009\u3000");
S("plain trailing BOM rejected", "12\uFEFF");
S("plain long digits", "3.14159265358979323846264338327950288");
S("json unicode escape tag", "{\"tag\":\"\\u0041\\u6E29\",\"value\":1}");
S("json non-BMP tag", "{\"tag\":\"\U0001F525\",\"value\":1}");
S("json lone surrogate tag escape", "{\"tag\":\"\\ud800\",\"value\":1}");
S("json raw newline in string rejected", "{\"tag\":\"a\nb\",\"value\":1}");
S("json brackets inside strings do not count toward depth", "{\"tag\":\"" + new string('[', 100) + "\",\"value\":1}");
S("json depth counted with objects", "{\"a\":" + string.Concat(Enumerable.Repeat("{\"a\":", 63)) + "1" + new string('}', 63) + ",\"value\":1}");
S("json depth 65 via objects rejected", "{\"a\":" + string.Concat(Enumerable.Repeat("{\"a\":", 64)) + "1" + new string('}', 64) + ",\"value\":1}");
S("json value NaN string throws", "{\"value\":\"NaN\"}");
S("json tag array throws", "{\"tag\":[\"A\"],\"value\":1}");
S("json tag bool throws", "{\"tag\":true,\"value\":1}");
S("json value exponent upper", "{\"value\":2E+2}");
S("json whitespace inside", "{ \"tag\" : \"A\" ,\n \"value\" :\t5 }");
S("json with .NET-only trailing whitespace (NEL)", "{\"value\":1}\u0085");
S("json with ideographic space prefix", "\u3000{\"value\":1}");
S("plain value with custom topic", "5", "a/b/c");
S("json no tag with custom topic", "{\"value\":5}", "plant/+/weird#topic");

S("json lone surrogate in quality throws", "{\"value\":1,\"quality\":\"\\udc00\"}");
S("json lone surrogate in ignored field ok", "{\"value\":1,\"unit\":\"\\ud800\"}");
S("json lone surrogate tag without value throws", "{\"tag\":\"\\ud800\"}");
S("json escaped property names match", "{\"t\\u0061g\":\"E\",\"v\\u0061lue\":4}");
S("json surrogate pair escape ok", "{\"tag\":\"\\ud83d\\udd25\",\"value\":1}");

S("plain dotless-i infinity (OrdinalIgnoreCase)", "\u0131nfinity");
S("plain mixed-case nAn", "nAn");
S("plain NaN with trailing NUL rejected", "NaN\0");
S("plain trailing space then NUL", "12 \0");
S("plain full-width digits rejected", "\uFF11\uFF12");
S("plain arabic-indic digits rejected", "\u0661");

var outArr = new JsonArray();
foreach (var (name, topic, payload) in cases)
{
    await using var client = new InMemoryMqttClient();
    var adapter = new MqttAdapter(client, new MqttAdapterOptions { Name = "p", BrokerUri = new Uri("mqtt://x"), Topics = ["#"] });
    await adapter.ConnectAsync();
    await client.PublishAsync(topic, payload);
    var exp = new JsonObject();
    try
    {
        var s = await adapter.PollAsync();
        if (s.Count == 0) exp["kind"] = "rejected";
        else
        {
            exp["kind"] = "sample";
            exp["tag"] = s[0].Tag;
            exp["value"] = double.IsFinite(s[0].Value) ? JsonValue.Create(s[0].Value) : JsonValue.Create(s[0].Value.ToString(CultureInfo.InvariantCulture));
            exp["negZero"] = s[0].Value == 0 && double.IsNegative(s[0].Value);
            exp["quality"] = s[0].Quality;
        }
    }
    catch (Exception ex) { exp["kind"] = "error"; exp["exception"] = ex.GetType().Name; }
    outArr.Add(new JsonObject { ["name"] = name, ["topic"] = topic, ["payloadBase64"] = Convert.ToBase64String(payload), ["expected"] = exp });
}
var json = outArr.ToJsonString(new JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
if (args.Length > 0) { File.WriteAllText(args[0], json + "\n"); Console.WriteLine($"wrote {outArr.Count} cases to {args[0]}"); }
else Console.WriteLine(json);
