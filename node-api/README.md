# Node.js IP Distance API

This repository contains a simple Node.js/Express application that calculates the distance between two IP addresses using the ipstack API for IP geolocation and the haversine formula. It also demonstrates how to cache results in an Amazon DynamoDB table using the AWS SDK for JavaScript (v3).

## Features
* IP Geolocation: Fetches latitude/longitude from ipstack.
* Distance Calculation: Uses the haversine formula to compute the distance (in kilometers) between two points (lat/long).
* Optional Caching: If --cache is provided at startup, results are stored in DynamoDB for subsequent retrieval.

## Prerequisites

1.	Node.js (v14 or higher, download)
2.	npm (usually bundled with Node.js)
3.	ipstack API Key – Sign up at ipstack.com to get one.
4.	AWS Credentials – If you want to use the DynamoDB caching feature, set up AWS credentials and region:

```
export AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=YOUR_SECRET_ACCESS_KEY
export AWS_REGION=us-west-2
```

Or configure via AWS CLI or credential files.

## Setup

1.	Clone this repository:

```bash
git clone https://github.com/your-account/your-repo.git
cd your-repo
```

2.	Install Dependencies:

```bash
npm install
```

This installs:
* express
* axios
* body-parser
* @aws-sdk/client-dynamodb
* @aws-sdk/lib-dynamodb

3.	Run the Application:

```bash
node app.js <ipstack_api_key> [--cache]
```

Where:
* <ipstack_api_key> is your valid ipstack API key.
* --cache is an optional flag to enable DynamoDB caching.

## Example Commands
* Without caching:

```bash
node app.js <ipstack_api_key>
```


* With caching:

```bash
node app.js <ipstack_api_key> --cache
```

If the table IPInfoResponses does not exist in DynamoDB, it will be created automatically.

## Usage

After starting the server, you can make requests to the /get-ip-info endpoint to retrieve IP geolocation data and distance:

```bash
curl "http://localhost:8080/get-ip-info?ip1=192.168.1.1&ip2=192.168.1.2"
```
### Response Format

```json
{
  "distance": 23.345,      // Distance in kilometers
  "request1": {...},       // Full ipstack response for ip1
  "request2": {...}        // Full ipstack response for ip2
}
```

* The request1 and request2 fields contain the JSON response from the ipstack API (e.g., city, country, latitude, longitude, etc.).
* The distance field is the calculated distance (in kilometers) using the haversine formula.

## Project Structure

```
├── app.js             // Main application file
├── package.json       // Project metadata and scripts
└── README.md          // You're reading it!
```

## How It Works

1.	Express Setup:

The application creates an Express server listening on port 8080.

2.	ipstack API Call:

When you call /get-ip-info?ip1=...&ip2=..., the app retrieves the geolocation for both IPs via http://api.ipstack.com/{ip}?access_key={key}.

3.	Distance Calculation:

Uses the haversine formula to calculate the distance in kilometers:
￼
* ￼ is the Earth’s radius in kilometers (6371).
* ￼ are latitudes in radians.
* ￼ are longitudes in radians.
	4.	DynamoDB Caching (Optional):
* If --cache is specified, the application attempts to look up the result from the IPInfoResponses table (keyed by ip1|ip2).
* If not found, it fetches from ipstack, calculates distance, then stores the result in DynamoDB for future lookups.

## Troubleshooting
* (optional)AWS Credentials: Ensure your AWS credentials and region are set up properly. (only required if --cache is used)
* ipstack API Key: Make sure your ipstack key is valid and has not exceeded its usage limits.
* Port Conflicts: If port 8080 is in use, change it in app.js.
* Node Version: Confirm you have a recent Node.js version that supports ES modules (v14+). If you encounter issues with import statements, try adding "type": "module" in your package.json or switch to CommonJS require.

## License

This project is licensed under the MIT License. See LICENSE for details.