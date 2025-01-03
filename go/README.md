# IP Distance Calculator

This is a trivial API that returns the distance between two IP addresses. It uses the ipstack API to get the latitude and longitude of the IP addresses and then uses the haversine formula to calculate the distance between the two points. This is a demo app for [Speedscale](https://speedscale.com/) proxymock.

## Features

- Calculate the distance between two IP addresses
- Uses ipstack API to get IP address information
- Simple and easy to use

## Requirements

- Go 1.16 or higher
- An ipstack API key (you can get one from [ipstack](https://ipstack.com/))

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/yourusername/ip-distance-calculator.git
    cd ip-distance-calculator
    ```

2. Install dependencies:
    ```sh
    go mod tidy
    ```

## Usage

1. Run the application:
    ```sh
    go run main.go <ipstack_api_key>
    ```

2. Make a GET request to the API:
    ```sh
    curl -X GET "http://localhost:8080/get-ip-info?ip1=192.168.1.1&ip2=192.168.1.2"
    ```

3. Example response:
    ```json
    {
        "distance": 12.34,
        "request1": {
            "city": "Tucker",
            "connection_type": "cable",
            "continent_code": "NA",
            "continent_name": "North America",
            "country_code": "US",
            "country_name": "United States",
            "dma": "524",
            "ip": "50.168.198.162",
            "ip_routing_type": "fixed",
            "latitude": 33.856021881103516,
            "location": {
                "calling_code": "1",
                "capital": "Washington D.C.",
                "country_flag": "https://assets.ipstack.com/flags/us.svg",
                "country_flag_emoji": "🇺🇸",
                "country_flag_emoji_unicode": "U+1F1FA U+1F1F8",
                "geoname_id": 4227213,
                "is_eu": false,
                "languages": [
                    {
                        "code": "en",
                        "name": "English",
                        "native": "English"
                    }
                ]
            },
            "longitude": -84.21367645263672,
            "msa": "12060",
            "radius": "46.20358",
            "region_code": "GA",
            "region_name": "Georgia",
            "type": "ipv4",
            "zip": "30084"
        },
        "request2": {
            "city": "Alpharetta",
            "connection_type": "cable",
            "continent_code": "NA",
            "continent_name": "North America",
            "country_code": "US",
            "country_name": "United States",
            "dma": "524",
            "ip": "174.49.112.125",
            "ip_routing_type": "fixed",
            "latitude": 34.08958053588867,
            "location": {
                "calling_code": "1",
                "capital": "Washington D.C.",
                "country_flag": "https://assets.ipstack.com/flags/us.svg",
                "country_flag_emoji": "🇺🇸",
                "country_flag_emoji_unicode": "U+1F1FA U+1F1F8",
                "geoname_id": 4179574,
                "is_eu": false,
                "languages": [
                    {
                        "code": "en",
                        "name": "English",
                        "native": "English"
                    }
                ]
            },
            "longitude": -84.29045867919922,
            "msa": "12060",
            "radius": "44.94584",
            "region_code": "GA",
            "region_name": "Georgia",
            "type": "ipv4",
            "zip": "30004"
        }
    }
    ```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


## Acknowledgements

- [ipstack](https://ipstack.com/) for providing the IP geolocation API
- [Haversine formula](https://en.wikipedia.org/wiki/Haversine_formula) for calculating distances between two points on the Earth since math is really hard.
