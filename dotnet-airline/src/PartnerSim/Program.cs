// Stand-in for the airline's partner systems: schedule/inventory (:5051), fare pricing (:5052)
// and payment gateway (:5053). Each call sleeps to resemble a real network dependency.
using System.Collections.Concurrent;
using System.Security.Cryptography;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.SetMinimumLevel(LogLevel.Warning);
builder.WebHost.UseUrls("http://127.0.0.1:5051", "http://127.0.0.1:5052", "http://127.0.0.1:5053");
var app = builder.Build();

static Task Lag(int min, int max) => Task.Delay(Random.Shared.Next(min, max));

var routes = new Dictionary<string, (string Dep, string Arr, int Minutes, int Number)>
{
    ["SLC-LAX"] = ("07:10", "08:25", 135, 1201),
    ["LAX-SLC"] = ("09:40", "12:45", 125, 1302),
    ["SLC-DEN"] = ("06:30", "08:35", 65, 2405),
    ["DEN-SLC"] = ("18:05", "19:15", 70, 2506),
};

app.MapGet("/schedule/v1/flights", async (string origin, string destination, string date) =>
{
    await Lag(120, 260);
    var key = $"{origin}-{destination}".ToUpperInvariant();
    if (!routes.TryGetValue(key, out var r))
        return Results.Json(new { flights = Array.Empty<object>() });
    var flights = new[] { 0, 1, 2 }.Select(i => new
    {
        flightNumber = $"DM{r.Number + i * 2}",
        origin = origin.ToUpperInvariant(),
        destination = destination.ToUpperInvariant(),
        date,
        departure = TimeOnly.Parse(r.Dep).AddHours(i * 4).ToString("HH:mm"),
        durationMinutes = r.Minutes,
        fareClasses = new[] { "Y", "M", "J" },
        seatsLeft = 9 - i * 3,
    });
    return Results.Json(new { flights });
});

var baseFare = new Dictionary<string, decimal> { ["Y"] = 89.00m, ["M"] = 149.00m, ["J"] = 389.00m };

app.MapPost("/pricing/v1/quote", async (QuoteRequest q) =>
{
    await Lag(150, 300);
    if (q.FareClass is null || q.FlightNumber is null || !baseFare.TryGetValue(q.FareClass, out var fare))
        return Results.Json(new { error = "unknown fare class" }, statusCode: 422);
    var perPax = fare + (q.FlightNumber.EndsWith('5') ? 20m : 0m);
    var taxes = Math.Round(perPax * 0.075m + 5.60m, 2);
    return Results.Json(new
    {
        flightNumber = q.FlightNumber,
        fareClass = q.FareClass,
        passengers = q.Passengers,
        currency = "USD",
        baseFarePerPassenger = perPax,
        taxesPerPassenger = taxes,
        fareBasis = $"{q.FareClass}14NR",
    });
});

// Idempotent on reference, like real gateways: a retry after a lost response gets the original approval, not a second one.
var approvals = new ConcurrentDictionary<string, AuthRequest>();
var approvalIds = new ConcurrentDictionary<string, string>();

app.MapPost("/payments/v1/authorize", async (AuthRequest a) =>
{
    await Lag(200, 400);
    if (string.IsNullOrEmpty(a.Reference) || string.IsNullOrEmpty(a.CardToken))
        return Results.Json(new { error = "reference and cardToken are required" }, statusCode: 400);
    if (a.CardToken == "tok_decline")
        return Results.Json(new { authorizationId = NewAuthId(), status = "DECLINED", reason = "insufficient_funds" }, statusCode: 402);
    var first = approvals.GetOrAdd(a.Reference, a);
    if (first.Amount != a.Amount || first.Currency != a.Currency)
        return Results.Json(new { error = "reference already authorized for a different amount" }, statusCode: 409);
    var authId = approvalIds.GetOrAdd(a.Reference, _ => NewAuthId());
    return Results.Json(new { authorizationId = authId, status = "APPROVED", amount = a.Amount, currency = a.Currency });
});

static string NewAuthId() => "auth_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant();

app.Run();

record QuoteRequest(string FlightNumber, string FareClass, int Passengers);
record AuthRequest(decimal Amount, string Currency, string CardToken, string Reference);
