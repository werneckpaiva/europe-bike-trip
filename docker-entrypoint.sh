#!/bin/bash
set -e

echo "Applying database migrations..."
python3 -m backend.run_migrations

echo "Starting Pedal Web Server..."
exec gunicorn --bind 0.0.0.0:8000 backend.app:app
