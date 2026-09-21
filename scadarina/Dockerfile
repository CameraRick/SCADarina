FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    openscad \
    python3 \
    python3-flask \
    libgl1-mesa-glx \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY app.py /app/
COPY static /app/static/

EXPOSE 5000
CMD ["python3", "app.py"]
