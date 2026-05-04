FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Expose the API port
EXPOSE 8000

# Set database path to the mounted volume
ENV DB_PATH=/data/pedal.db
# Set PYTHONPATH so gunicorn can find backend.app
ENV PYTHONPATH=/app

# Make entrypoint script executable
RUN chmod +x docker-entrypoint.sh

# Use the entrypoint script to run migrations and then start the server
ENTRYPOINT ["./docker-entrypoint.sh"]
