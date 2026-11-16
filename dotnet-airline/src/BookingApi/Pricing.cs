// Fare math for a cart line. Kept separate so a change here is easy to review and to replay.
public static class Pricing
{
    public const decimal BookingFeePerPassenger = 4.50m;

    public static decimal LineTotal(Quote q)
    {
        var perPassenger = q.BaseFarePerPassenger + q.TaxesPerPassenger + BookingFeePerPassenger;
        return decimal.Round(perPassenger * q.Passengers, 2, MidpointRounding.AwayFromZero);
    }
}

public record Quote(
    string FlightNumber,
    string FareClass,
    int Passengers,
    string Currency,
    decimal BaseFarePerPassenger,
    decimal TaxesPerPassenger,
    string FareBasis);
