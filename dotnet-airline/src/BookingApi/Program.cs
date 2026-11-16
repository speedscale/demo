// Booking API: offers -> cart -> price -> checkout -> order.
// Dependencies: schedule, pricing and payment partner APIs over HTTP, and Redis for offer cache, carts and orders.
using System.Net.Http.Json;
using System.Text.Json;
using StackExchange.Redis;

string Env(string name, string fallback) => Environment.GetEnvironmentVariable(name) ?? fallback;

var scheduleUrl = Env("SCHEDULE_URL", "http://127.0.0.1:5051");
var pricingUrl = Env("PRICING_URL", "http://127.0.0.1:5052");
var paymentsUrl = Env("PAYMENTS_URL", "http://127.0.0.1:5053");
var redisAddr = Env("REDIS_ADDR", "127.0.0.1:6390");
var port = Env("PORT", "8090");

// Partner URLs are explicit endpoints (local or port-mapped), so skip any ambient proxy settings.
var http = new HttpClient(new SocketsHttpHandler { UseProxy = false }) { Timeout = TimeSpan.FromSeconds(5) };

// Plain command set: no cluster discovery, config reads or pub/sub channel, so traffic is just the app's own commands.
var redisOptions = ConfigurationOptions.Parse(redisAddr);
redisOptions.CommandMap = CommandMap.Create(new HashSet<string> { "CONFIG", "CLUSTER", "SUBSCRIBE", "PSUBSCRIBE", "UNSUBSCRIBE", "ECHO", "CLIENT", "SENTINEL" }, available: false);
redisOptions.ConfigurationChannel = "";
redisOptions.TieBreaker = "";
redisOptions.AbortOnConnectFail = false;
redisOptions.ConnectTimeout = 3000;
var redis = ConnectionMultiplexer.Connect(redisOptions);
IDatabase Db() => redis.GetDatabase();

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);

var builder = WebApplication.CreateBuilder(args);
builder.Logging.SetMinimumLevel(LogLevel.Warning);
builder.WebHost.UseUrls($"http://127.0.0.1:{port}");
var app = builder.Build();

app.MapGet("/healthz", () => Results.Json(new { status = "ok" }));

app.MapGet("/api/offers", async (string origin, string destination, string date) =>
{
    var key = $"offers:{origin.ToUpperInvariant()}:{destination.ToUpperInvariant()}:{date}";
    var cached = await Db().StringGetAsync(key);
    string body;
    if (cached.HasValue)
    {
        body = cached!;
    }
    else
    {
        body = await http.GetStringAsync($"{scheduleUrl}/schedule/v1/flights?origin={origin}&destination={destination}&date={date}");
        await Db().StringSetAsync(key, body, TimeSpan.FromMinutes(5));
    }
    var flights = JsonDocument.Parse(body).RootElement.GetProperty("flights");
    return Results.Json(new { origin, destination, date, cached = cached.HasValue, offers = flights });
});

app.MapPost("/api/carts", async (NewCart req) =>
{
    if (req.Passengers is < 1 or > 9)
        return Results.Json(new { error = "passengers must be 1-9" }, statusCode: 400);
    var seq = await Db().StringIncrementAsync("seq:cart");
    var cartId = $"C{seq:D6}";
    await Db().HashSetAsync($"cart:{cartId}", new[]
    {
        new HashEntry("passengers", req.Passengers),
        new HashEntry("status", "OPEN"),
    });
    return Results.Json(new { cartId, passengers = req.Passengers, status = "OPEN" }, statusCode: 201);
});

app.MapPost("/api/carts/{cartId}/items", async (string cartId, NewItem item) =>
{
    var pax = await Db().HashGetAsync($"cart:{cartId}", "passengers");
    if (!pax.HasValue)
        return Results.Json(new { error = "cart not found" }, statusCode: 404);

    var resp = await http.PostAsJsonAsync($"{pricingUrl}/pricing/v1/quote",
        new { flightNumber = item.FlightNumber, fareClass = item.FareClass, passengers = (int)pax });
    if (!resp.IsSuccessStatusCode)
        return Results.Json(new { error = "fare not available" }, statusCode: 422);
    var quote = (await resp.Content.ReadFromJsonAsync<Quote>(json))!;

    // Store the partner quote as returned; totals are computed on read so pricing rules apply consistently.
    await Db().HashSetAsync($"cart:{cartId}", $"item:{item.FlightNumber}", JsonSerializer.Serialize(quote, json));
    return Results.Json(ToLine(quote), statusCode: 201);
});

app.MapGet("/api/carts/{cartId}", async (string cartId) =>
{
    var cart = await LoadCart(cartId);
    return cart is null ? Results.Json(new { error = "cart not found" }, statusCode: 404) : Results.Json(cart);
});

app.MapPost("/api/carts/{cartId}/checkout", async (string cartId, Checkout req) =>
{
    var cart = await LoadCart(cartId);
    if (cart is null)
        return Results.Json(new { error = "cart not found" }, statusCode: 404);
    if (cart.Lines.Count == 0)
        return Results.Json(new { error = "cart is empty" }, statusCode: 400);
    if (cart.Status == "ORDERED")
        return Results.Json(new { error = "cart already ordered", cartId, recordLocator = cart.RecordLocator }, statusCode: 409);

    // One checkout per cart: HSETNX claims it, and any failure before ticketing releases the claim for a retry.
    var cartKey = $"cart:{cartId}";
    if (!await Db().HashSetAsync(cartKey, "checkout", "PENDING", When.NotExists))
        return Results.Json(new { error = "checkout already in progress", cartId }, statusCode: 409);
    async Task<IResult> Release(IResult result)
    {
        // Best effort: the payment outcome is the answer the caller needs, even if the release fails.
        try { await Db().HashDeleteAsync(cartKey, "checkout"); } catch (RedisException) { }
        return result;
    }

    HttpResponseMessage pay;
    try
    {
        pay = await http.PostAsJsonAsync($"{paymentsUrl}/payments/v1/authorize",
            new { amount = cart.Total, currency = "USD", cardToken = req.CardToken, reference = cartId });
    }
    catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
    {
        return await Release(Results.Json(new { error = "payment provider unavailable", cartId, retryable = true }, statusCode: 503));
    }

    if ((int)pay.StatusCode >= 500)
        return await Release(Results.Json(new { error = "payment provider unavailable", cartId, retryable = true }, statusCode: 503));
    if (pay.StatusCode != System.Net.HttpStatusCode.PaymentRequired && !pay.IsSuccessStatusCode)
        return await Release(Results.Json(new { error = "payment provider rejected the request", cartId, providerStatus = (int)pay.StatusCode }, statusCode: 502));

    JsonElement auth;
    try
    {
        auth = (await pay.Content.ReadFromJsonAsync<JsonElement>())!;
    }
    catch (JsonException)
    {
        return await Release(Results.Json(new { error = "payment provider returned an unreadable response", cartId, retryable = true }, statusCode: 502));
    }

    if (!pay.IsSuccessStatusCode || auth.GetProperty("status").GetString() != "APPROVED")
        return await Release(Results.Json(new { error = "payment declined", cartId, reason = auth.TryGetProperty("reason", out var r) ? r.GetString() : null }, statusCode: 402));

    var seq = await Db().StringIncrementAsync("seq:order");
    var recordLocator = RecordLocator(seq);
    var order = new Order(recordLocator, cartId, "TICKETED", cart.Passengers, cart.Lines, cart.Total, "USD", auth.GetProperty("authorizationId").GetString()!);
    await Db().StringSetAsync($"order:{recordLocator}", JsonSerializer.Serialize(order, json));
    await Db().HashSetAsync(cartKey, new[] { new HashEntry("status", "ORDERED"), new HashEntry("order", recordLocator) });
    return Results.Json(order, statusCode: 201);
});

app.MapGet("/api/orders/{recordLocator}", async (string recordLocator) =>
{
    var raw = await Db().StringGetAsync($"order:{recordLocator}");
    return raw.HasValue
        ? Results.Content(raw!, "application/json")
        : Results.Json(new { error = "order not found" }, statusCode: 404);
});

app.Run();

async Task<CartView?> LoadCart(string cartId)
{
    var entries = await Db().HashGetAllAsync($"cart:{cartId}");
    if (entries.Length == 0) return null;
    var fields = entries.ToDictionary(e => (string)e.Name!, e => (string)e.Value!);
    var lines = fields.Where(f => f.Key.StartsWith("item:")).OrderBy(f => f.Key)
        .Select(f => ToLine(JsonSerializer.Deserialize<Quote>(f.Value, json)!)).ToList();
    return new CartView(cartId, int.Parse(fields["passengers"]), fields["status"], lines, lines.Sum(l => l.Total), fields.GetValueOrDefault("order"));
}

static CartLine ToLine(Quote q) => new(q.FlightNumber, q.FareClass, q.Passengers, q.FareBasis, q.Currency, Pricing.LineTotal(q));

// Six-character locator derived from the order sequence, like a PNR.
static string RecordLocator(long seq)
{
    const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var n = seq * 7919 + 104_729;
    var chars = new char[6];
    for (var i = 5; i >= 0; i--) { chars[i] = alphabet[(int)(n % alphabet.Length)]; n /= alphabet.Length; }
    return new string(chars);
}

record NewCart(int Passengers);
record NewItem(string FlightNumber, string FareClass);
record Checkout(string CardToken);
record CartLine(string FlightNumber, string FareClass, int Passengers, string FareBasis, string Currency, decimal Total);
record CartView(string CartId, int Passengers, string Status, List<CartLine> Lines, decimal Total, string? RecordLocator);
record Order(string RecordLocator, string CartId, string Status, int Passengers, List<CartLine> Lines, decimal Total, string Currency, string AuthorizationId);
