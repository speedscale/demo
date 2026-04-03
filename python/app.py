from flask import Flask, jsonify
import requests

app = Flask(__name__)


@app.route("/healthz", methods=["GET"])
def healthz():
    return jsonify({"status": "ok"})


@app.route("/spacex/launches", methods=["GET"])
def get_spacex_launches():
    try:
        response = requests.get(
            "https://api.spacexdata.com/v4/launches/latest", timeout=10
        )
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5001)
