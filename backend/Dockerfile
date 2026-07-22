# syntax=docker/dockerfile:1
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8080 \
    LOG_FILE= \
    HF_HOME=/tmp/huggingface \
    TRANSFORMERS_CACHE=/tmp/huggingface/transformers

WORKDIR /app

# libgomp is needed by the prebuilt CPU PyTorch/scikit-learn wheels for OpenMP.
RUN apt-get update \
    && apt-get install --no-install-recommends -y libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app \
    && useradd --system --gid app --create-home --home-dir /home/app app

# Keep dependency installation in its own layer so source changes do not
# reinstall the ML stack.
COPY requirements.txt ./
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY --chown=app:app app ./app
COPY --chown=app:app models ./models

# Fine-tuning can write model artefacts; Cloud Run treats this as ephemeral.
RUN mkdir -p /app/logs /tmp/huggingface \
    && chown -R app:app /app /tmp/huggingface

USER app

EXPOSE 8080

# Cloud Run injects PORT. One worker avoids duplicating the two CPU ML models.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT}\" --workers 1 --timeout-graceful-shutdown 30"]
