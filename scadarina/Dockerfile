FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    libgl1-mesa-glx \
    fonts-dejavu-core \
    python3 \
    python3-flask \
    openscad \
    && echo 'deb http://download.opensuse.org/repositories/home:/t-paul/Debian_12/ /' > /etc/apt/sources.list.d/home:t-paul.list \
    && curl -fsSL https://download.opensuse.org/repositories/home:t-paul/Debian_12/Release.key | gpg --dearmor > /etc/apt/trusted.gpg.d/home_t-paul.gpg \
    && apt-get update \
    && apt-get install -y --no-install-recommends openscad-nightly \
    && apt-get purge -y --auto-remove curl gnupg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY app.py /app/
COPY static /app/static/

EXPOSE 5000
CMD ["python3", "app.py"]
