using System.Net.Http.Json;

// Get server URL from environment or use default
var serverUrl = Environment.GetEnvironmentVariable("SERVER_URL") ?? "http://localhost:8080";
var delayMs = int.Parse(Environment.GetEnvironmentVariable("DELAY_MS") ?? "5000");

Console.WriteLine($"C# Weather Client starting...");
Console.WriteLine($"Target server: {serverUrl}");
Console.WriteLine($"Request delay: {delayMs}ms");

using var httpClient = new HttpClient { BaseAddress = new Uri(serverUrl) };

// Wait for server to be ready
Console.WriteLine("Waiting for server to be ready...");
var maxRetries = 30;
var retryCount = 0;
while (retryCount < maxRetries)
{
    try
    {
        var healthResponse = await httpClient.GetAsync("/health");
        if (healthResponse.IsSuccessStatusCode)
        {
            Console.WriteLine("Server is ready!");
            break;
        }
    }
    catch
    {
        // Server not ready yet
    }

    retryCount++;
    if (retryCount >= maxRetries)
    {
        Console.WriteLine("Server did not become ready in time. Exiting.");
        return 1;
    }

    Console.WriteLine($"Waiting for server... (attempt {retryCount}/{maxRetries})");
    await Task.Delay(2000);
}

// Start generating traffic
Console.WriteLine("Starting traffic generation...");
var requestCount = 0;

while (true)
{
    try
    {
        requestCount++;
        Console.WriteLine($"\n[Request #{requestCount}] {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss}");

        // Health check
        Console.WriteLine("  -> GET /health");
        var healthResponse = await httpClient.GetAsync("/health");
        if (healthResponse.IsSuccessStatusCode)
        {
            var healthData = await healthResponse.Content.ReadFromJsonAsync<Dictionary<string, object>>();
            Console.WriteLine($"     Status: {healthResponse.StatusCode} - {healthData?["status"]}");
        }
        else
        {
            Console.WriteLine($"     Status: {healthResponse.StatusCode} (Failed)");
        }

        // Weather forecast
        Console.WriteLine("  -> GET /weatherforecast");
        var weatherResponse = await httpClient.GetAsync("/weatherforecast");
        if (weatherResponse.IsSuccessStatusCode)
        {
            var weatherData = await weatherResponse.Content.ReadAsStringAsync();
            Console.WriteLine($"     Status: {weatherResponse.StatusCode} - Received weather data ({weatherData.Length} bytes)");
        }
        else
        {
            Console.WriteLine($"     Status: {weatherResponse.StatusCode} (Failed)");
        }

        // Wait before next request
        await Task.Delay(delayMs);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"  Error: {ex.Message}");
        await Task.Delay(delayMs);
    }
}
