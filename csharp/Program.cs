using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Only redirect to HTTPS in production
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// Health check endpoint
app.MapGet("/health", () =>
{
    return Results.Ok(new
    {
        status = "healthy",
        timestamp = DateTime.UtcNow.ToString("O"),
        environment = app.Environment.EnvironmentName
    });
})
.WithName("HealthCheck")
.WithTags("Health")
.WithOpenApi();

// Get configuration values with fallbacks
var apiKey = Environment.GetEnvironmentVariable("OPENWEATHER_API_KEY") ?? "b1e641006d0b095192f4e5dd0932f93d";
var defaultCity = Environment.GetEnvironmentVariable("OPENWEATHER_CITY") ?? "Cebu City";
var proxyUrl = Environment.GetEnvironmentVariable("HTTP_PROXY");

// Weather API integration
app.MapGet("/weatherforecast", async () =>
{
    var city = defaultCity;
    var apiUrl = $"https://api.openweathermap.org/data/2.5/forecast?q={city}&units=metric&appid={apiKey}";

    // Configure proxy if specified
    var handler = new HttpClientHandler();
    if (!string.IsNullOrEmpty(proxyUrl))
    {
        handler.Proxy = new WebProxy(proxyUrl);
        handler.UseProxy = true;
    }

    using var httpClient = new HttpClient(handler);

    try
    {
        var response = await httpClient.GetFromJsonAsync<OpenWeatherResponse>(apiUrl);
        if (response?.list == null)
        {
            return Results.Problem("Unable to fetch weather data.");
        }

        var forecast = response.list.Take(5).Select(item => new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Parse(item.dt_txt)),
            (int)item.main.temp,
            item.weather.FirstOrDefault()?.description ?? "No description"
        )).ToArray();

        return Results.Ok(forecast);
    }
    catch (HttpRequestException ex)
    {
        return Results.Problem($"Error fetching weather data: {ex.Message}");
    }
})
.WithName("GetWeatherForecast")
.WithTags("Weather")
.WithOpenApi();

// Run the app
app.Run();

// WeatherForecast record
record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}

// Classes for deserializing OpenWeather API response
public class OpenWeatherResponse
{
    public List<WeatherData>? list { get; set; }
}

public class WeatherData
{
    public MainData main { get; set; } = new();
    public List<WeatherDescription> weather { get; set; } = new();
    public string dt_txt { get; set; } = string.Empty;
}

public class MainData
{
    public float temp { get; set; }
}

public class WeatherDescription
{
    public string description { get; set; } = string.Empty;
}
