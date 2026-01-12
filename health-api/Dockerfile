FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for admin features
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
    docker-compose \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app.py .

# Run with gunicorn
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "30", "app:app"]
