#!/bin/bash

# Change to the script's directory
cd "$(dirname "$0")"

# Load environment variables from .env if it exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

echo "Starting Pedal Web Server via backend/app.py..."
# Run the proper python application
./venv/bin/python3 -m backend.app
