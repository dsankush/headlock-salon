# Headlocks voice agent — image for LiveKit Cloud (built by `lk agent create` / `lk agent deploy`)
ARG PYTHON_VERSION=3.12
FROM python:${PYTHON_VERSION}-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ python3-dev \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 appuser
WORKDIR /home/appuser/app

# Dependencies first for faster rebuilds
COPY requirements.txt .
RUN python -m venv /home/appuser/venv && /home/appuser/venv/bin/pip install -r requirements.txt
ENV PATH="/home/appuser/venv/bin:$PATH"

COPY agent.py db.py prompts.py ./
RUN chown -R appuser:appuser /home/appuser
USER appuser

# Bake the VAD / turn-detector model files into the image so calls start instantly
RUN python agent.py download-files

# LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET are injected by LiveKit Cloud.
# Other keys come from `lk agent create --secrets-file secrets.env`.
CMD ["python", "agent.py", "start"]
