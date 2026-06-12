using System.Collections.Concurrent;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// In-memory stores. A real app would use a database; this keeps the demo
// dependency-free (no MySQL/etc to stand up).
var carts = new ConcurrentDictionary<string, Cart>();
var orders = new ConcurrentDictionary<string, Order>();

const decimal UnitPrice = 9.99m;

app.MapGet("/healthz", () => Results.Ok(new { status = "ok" }));

// 1. Start a cart and add the first item. Returns a new cartId AND itemId.
app.MapPost("/carts", (AddItemRequest? req) =>
{
    var cartId = Guid.NewGuid().ToString();
    var itemId = Guid.NewGuid().ToString();
    var sku = req?.Sku ?? "WIDGET-1";
    var qty = req?.Qty ?? 1;

    var cart = new Cart(cartId);
    cart.Items[itemId] = new CartItem(itemId, sku, qty);
    carts[cartId] = cart;

    return Results.Created($"/carts/{cartId}", new
    {
        cartId,
        itemId,
        sku,
        qty,
        lineTotal = qty * UnitPrice
    });
});

// 2. Update an item's quantity. Needs BOTH the cartId and itemId echoed back in
//    the request body (not the URL) — so both are correlated values.
app.MapPost("/carts/items/update", (UpdateItemRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req.CartId) || string.IsNullOrWhiteSpace(req.ItemId))
        return Results.BadRequest(new { error = "cartId and itemId are required" });
    if (!carts.TryGetValue(req.CartId, out var cart))
        return Results.NotFound(new { error = "cart not found", cartId = req.CartId });
    if (!cart.Items.TryGetValue(req.ItemId, out var item))
        return Results.NotFound(new { error = "item not found", itemId = req.ItemId });

    var qty = req.Qty ?? item.Qty;
    cart.Items[req.ItemId] = item with { Qty = qty };

    return Results.Ok(new
    {
        cartId = req.CartId,
        itemId = req.ItemId,
        sku = item.Sku,
        qty,
        lineTotal = qty * UnitPrice
    });
});

// 3. Checkout the cart -> creates an order. Needs the cartId; returns a new orderId.
app.MapPost("/carts/checkout", (CheckoutRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req.CartId))
        return Results.BadRequest(new { error = "cartId is required" });
    if (!carts.TryGetValue(req.CartId, out var cart))
        return Results.NotFound(new { error = "cart not found", cartId = req.CartId });

    var orderId = Guid.NewGuid().ToString();
    var total = cart.Items.Values.Sum(i => i.Qty * UnitPrice);
    orders[orderId] = new Order(orderId, req.CartId, "pending");

    return Results.Created($"/orders/{orderId}", new
    {
        orderId,
        cartId = req.CartId,
        total,
        status = "pending"
    });
});

// 4. Confirm/pay the order. Needs the orderId in the body.
app.MapPost("/orders/confirm", (ConfirmOrderRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req.OrderId))
        return Results.BadRequest(new { error = "orderId is required" });
    if (!orders.TryGetValue(req.OrderId, out var order))
        return Results.NotFound(new { error = "order not found", orderId = req.OrderId });

    orders[req.OrderId] = order with { Status = "confirmed" };
    return Results.Ok(new
    {
        orderId = req.OrderId,
        status = "confirmed",
        confirmedAt = DateTime.UtcNow.ToString("O")
    });
});

app.MapGet("/carts", () => Results.Ok(carts.Values.Select(c => new
{
    cartId = c.CartId,
    items = c.Items.Values
})));

app.MapGet("/orders", () => Results.Ok(orders.Values.Select(o => new
{
    orderId = o.OrderId,
    cartId = o.CartId,
    status = o.Status
})));

app.Run();

record AddItemRequest(string? Sku, int? Qty);
record UpdateItemRequest(string CartId, string ItemId, int? Qty);
record CheckoutRequest(string CartId);
record ConfirmOrderRequest(string OrderId);

record CartItem(string ItemId, string Sku, int Qty);
record Order(string OrderId, string CartId, string Status);

class Cart
{
    public Cart(string cartId) => CartId = cartId;
    public string CartId { get; }
    public ConcurrentDictionary<string, CartItem> Items { get; } = new();
}
