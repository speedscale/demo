using System.Collections.Concurrent;

var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

// In-memory order store: orderId -> status
var orders = new ConcurrentDictionary<string, string>();

// Health check
app.MapGet("/healthz", () => Results.Ok(new { status = "ok" }));

// List orders
app.MapGet("/orders", () =>
{
    var list = orders.Select(kvp => new { orderId = kvp.Key, status = kvp.Value }).ToList();
    return Results.Ok(list);
});

// Create order — generates a new UUID v4 order id
app.MapPost("/orders", (CreateOrderRequest? req) =>
{
    var orderId = Guid.NewGuid().ToString();
    orders[orderId] = "created";
    return Results.Created($"/orders/{orderId}", new
    {
        orderId,
        status = "created",
        item = req?.Item ?? "unknown",
        quantity = req?.Quantity ?? 1,
        createdAt = DateTime.UtcNow.ToString("O")
    });
});

// Confirm order — accepts the same orderId in the request body
app.MapPost("/orders/confirm", (ConfirmOrderRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req.OrderId))
        return Results.BadRequest(new { error = "orderId is required" });

    if (!orders.ContainsKey(req.OrderId))
        return Results.NotFound(new { error = "order not found", orderId = req.OrderId });

    orders[req.OrderId] = "confirmed";
    return Results.Ok(new
    {
        orderId = req.OrderId,
        status = "confirmed",
        confirmedAt = DateTime.UtcNow.ToString("O")
    });
});

app.Run();

record CreateOrderRequest(string? Item, int? Quantity);
record ConfirmOrderRequest(string OrderId);
