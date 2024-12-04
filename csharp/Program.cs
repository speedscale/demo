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

app.UseHttpsRedirection();

var apiKey = "b1e641006d0b095192f4e5dd0932f93d"; // Replace with your actual OpenWeather API key

// Weather API integration
app.MapGet("/weatherforecast", async () =>
{

    var city = "Cebu City"; // Replace with your desired city
    var apiUrl = $"https://api.openweathermap.org/data/2.5/forecast?q={city}&units=metric&appid={apiKey}";

    // Configure proxy
    var proxy = new HttpClientHandler
    {
        Proxy = new WebProxy("http://localhost:4140"), // proxy on speedctl
        // {
        //     Credentials = new NetworkCredential("username", "password") // Optional: Replace with proxy credentials
        // },
        UseProxy = true,
    };

    using var httpClient = new HttpClient(proxy);

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
})
.WithName("GetWeatherForecast");

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
