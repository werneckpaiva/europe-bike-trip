import os
from flask import Flask, jsonify, request
from backend.database import Database

# Use absolute path for static files relative to this file
# This assumes the project root structure is preserved in the container
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')

PORT = 8000
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "pedal.db"))

db = Database(DB_PATH)

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/config', methods=['GET'])
def get_config():
    config = db.get_config()
    if config:
        return jsonify(config)
    return jsonify({"cities": None, "selected_cities": None}), 404

@app.route('/api/config', methods=['POST'])
def save_config():
    data = request.json
    cities = data.get('cities', [])
    selected_cities = data.get('selected_cities', [])
    db.save_config(cities, selected_cities)
    return jsonify({"status": "success"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT)
