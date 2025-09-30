# XML HTTP Server Demo

A simple HTTP server that accepts XML POST requests and returns XML responses.

## Features

- Accepts POST requests with XML query data
- Parses XML request containing query information (id, type, filter)
- Returns XML response with sample data based on the query
- Built with Python Flask

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the server:
```bash
python app.py
```

The server will start on `http://localhost:8080`

## Usage

Send POST requests to `http://localhost:8080/query` with XML content.

### Example Request

```xml
<?xml version="1.0" encoding="UTF-8"?>
<query>
    <id>12345</id>
    <type>user_data</type>
    <filter>active_users</filter>
</query>
```

### Example Response

```xml
<?xml version='1.0' encoding='unicode'?>
<response>
    <status>success</status>
    <timestamp>2023-10-01T12:00:00.000000</timestamp>
    <data>
        <item id="1">
            <name>Sample Data 1</name>
            <value>Value for user_data</value>
        </item>
        <item id="2">
            <name>Sample Data 2</name>
            <value>Filtered by active_users</value>
        </item>
        <item id="3">
            <name>Query ID</name>
            <value>12345</value>
        </item>
    </data>
</response>
```

### Testing with curl

```bash
curl -X POST -H "Content-Type: application/xml" -d @example-request.xml http://localhost:8080/query
```

## Files

- `app.py` - Main Flask application
- `requirements.txt` - Python dependencies
- `example-request.xml` - Sample XML request for testing
- `main.go` - Alternative Go implementation (not used)