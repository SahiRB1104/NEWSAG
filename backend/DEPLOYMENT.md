# Backend deployment

## What is deployed

The FastAPI ASGI object is `app.main:app`. The production command is:

```sh
uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 1 --timeout-graceful-shutdown 30
```

`/` and `/health` are the available unauthenticated health endpoints. Startup
requires a valid `MONGO_URI`, creates indexes, and then starts non-blocking Redis,
model, and Ollama warmups. Redis and Ollama failures do not stop the service, but
MongoDB is required.

The image includes the repository's two local fine-tuned Safetensors models:
`models/sentiment_finetuned` and `models/credibility_finetuned`. It deliberately
excludes `models/training_runs`, which contains disposable checkpoints. If either
fine-tuned directory is absent, the application falls back to downloading its
Hugging Face base model into the writable temporary cache.

## Local Docker

1. Copy `.env.example` to `.env` and set real external-service values.
2. From `backend`, run `docker compose up --build`.
3. Check `http://localhost:8000/health`.

The compose bind mount is intentional for development. It does not run MongoDB,
Redis, or Ollama: point `MONGO_URI`, `REDIS_URL`, and (optionally)
`OLLAMA_BASE_URL` at services reachable from the container.

## Cloud Run

Build from the `backend` directory (or set that directory as the Docker build
context), then deploy the image. Cloud Run supplies `PORT`; do not override it.
Set the real values from `.env.example` as Cloud Run environment variables or,
for credentials, Secret Manager references.

Recommended service settings:

- one instance worker (`--workers 1`) because each worker loads both CPU ML models;
- at least 2 vCPU and 2 GiB memory, with more memory if fine-tuning is enabled;
- a startup timeout sufficient for MongoDB index creation and the first model load;
- `/health` as the readiness/liveness probe path where your deployment tooling
  supports HTTP probes.

Cloud Run storage is ephemeral. The service is stateless for normal inference,
but fine-tuning output and log files do not persist across instance replacement.
Persist training artefacts externally before relying on them. `LOG_FILE` is blank
in the Docker image so logs are emitted to stdout for Cloud Logging.

Cloud Run cannot reach `localhost` services outside its container. Use managed or
network-accessible MongoDB/Redis and set an externally reachable Ollama endpoint,
or accept the chatbot's existing rule-based fallback.
