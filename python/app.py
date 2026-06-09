from flask import Flask, jsonify, request
import requests as http

app = Flask(__name__)


@app.route("/healthz", methods=["GET"])
def healthz():
    return jsonify({"status": "ok"})


@app.route("/models", methods=["GET"])
def get_models():
    try:
        r = http.get(
            "https://huggingface.co/api/models",
            params={"sort": "downloads", "direction": "-1", "limit": "5"},
            timeout=10,
        )
        r.raise_for_status()
        return jsonify(r.json())
    except http.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 500


@app.route("/models/<path:model_id>", methods=["GET"])
def get_model(model_id):
    try:
        r = http.get(
            f"https://huggingface.co/api/models/{model_id}",
            timeout=10,
        )
        r.raise_for_status()
        return jsonify(r.json())
    except http.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 500


@app.route("/llm/models", methods=["GET"])
def get_llm_models():
    try:
        r = http.get("https://openrouter.ai/api/v1/models", timeout=10)
        r.raise_for_status()
        return jsonify(r.json())
    except http.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 500


@app.route("/nasa", methods=["GET"])
def get_nasa():
    try:
        r = http.get(
            "https://api.nasa.gov/planetary/apod",
            params={"api_key": "DEMO_KEY"},
            timeout=10,
        )
        r.raise_for_status()
        return jsonify(r.json())
    except http.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 500


@app.route("/events", methods=["GET"])
def get_events():
    try:
        r = http.get(
            "https://api.github.com/orgs/speedscale/events",
            timeout=10,
        )
        r.raise_for_status()
        return jsonify(r.json())
    except http.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5001)
