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

# Command to run the application using gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "backend.app:app"]
