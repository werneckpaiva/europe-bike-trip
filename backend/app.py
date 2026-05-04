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

# Run database migration to new hierarchy format on startup
from backend.migrations import run_all_migrations
try:
    run_all_migrations(db)
except Exception as e:
    import logging
    logging.getLogger(__name__).error(f"Failed to run database migration: {e}")

@app.route('/')
def index():
    return app.send_static_file('index.html')

# ── Project Endpoints ────────────────────────────────────────

@app.route('/api/projects', methods=['GET'])
def get_projects():
    projects = db.get_projects()
    return jsonify(projects)

@app.route('/api/projects', methods=['POST'])
def create_project():
    data = request.json
    name = data.get('name', 'New Trip')
    description = data.get('description', '')
    project_id = db.create_project(name, description)
    return jsonify({"id": project_id, "status": "success"})

@app.route('/api/projects/<int:project_id>', methods=['PUT'])
def update_project(project_id):
    data = request.json
    name = data.get('name')
    description = data.get('description')
    db.update_project(project_id, name=name, description=description)
    return jsonify({"status": "success"})

@app.route('/api/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    db.delete_project(project_id)
    return jsonify({"status": "success"})

# ── Route Endpoints (Project-scoped) ─────────────────────────

@app.route('/api/projects/<int:project_id>/route', methods=['GET'])
def get_project_route(project_id):
    config = db.get_config(project_id)
    if config:
        return jsonify(config)
    return jsonify({"cities": [], "selected_cities": []}), 404

@app.route('/api/projects/<int:project_id>/route', methods=['POST'])
def save_project_route(project_id):
    data = request.json
    cities = data.get('cities', [])
    selected_cities = data.get('selected_cities', [])
    db.save_config(cities, selected_cities, project_id)
    return jsonify({"status": "success"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT)
