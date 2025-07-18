# SpaceX Launches API Demo

A simple Flask application that proxies SpaceX API data.

## Setup

1. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Running the Application

```bash
python app.py
```

The application will start on `http://0.0.0.0:5001`

## API Endpoints

- `GET /spacex/launches` - Returns the latest SpaceX launch data

## Testing

You can test the endpoint using curl:
```bash
curl http://localhost:5001/spacex/launches
```

Or use the provided `test.http` file if you have a REST client extension.