# 🌟 NewsAura

![Build](https://img.shields.io/badge/build-local%20only-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)
![React](https://img.shields.io/badge/React-19.2.0-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6)
![Vite](https://img.shields.io/badge/Vite-7.2.4-646CFF)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.18-38B2AC)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688)
![MongoDB](https://img.shields.io/badge/MongoDB-database-47A248)
![Redis](https://img.shields.io/badge/Redis-cache-DC382D)

AI-augmented news reader for personalized discovery, saving, summaries, sentiment, credibility checks, and lightweight analytics.

# Live -https://newsag-nine.vercel.app

## 🧭 Project Overview

NewsAura is a full-stack news workspace that helps users browse curated topic feeds, save articles, read later, and understand stories faster with server-side summaries, sentiment labels, and a chatbot assistant. It exists to cut down the time spent sifting through large volumes of news while keeping everything tied to a user profile, reading history, and admin review workflow.

It is built for readers, analysts, journalists, researchers, and admins who need a more organized way to follow news, verify quality signals, and measure engagement over time.

## ✨ Features

- 📰 Topic-based news feeds with search, suggestions, and trending headlines.
- 🔖 Bookmarks and read-later lists backed by authenticated user storage.
- 🧠 Server-side article summaries with translation support.
- 😊 ML-powered sentiment analysis for saved content and feedback flows.
- ✅ Credibility review tools for report queues and fake-news classification support.
- 💬 A chatbot assistant that can use saved context and local LLM responses.
- 🔊 Text-to-speech generation for article content and summaries.
- 📈 Profile analytics with streaks, weekly activity, top categories, and engagement scoring.
- 🛠️ Admin tuning tools for importing training data, reviewing jobs, and tracking metrics.
- ⚡ Redis-backed caching and GNews hit tracking for faster, cheaper feed delivery.
- 🔐 Clerk-based authentication and route protection for user and admin features.

## 🛠️ Tech Stack

### Frontend

- ⚛️ React 19.2.0 for the UI shell and route-based pages.
- 🟦 TypeScript 5.9.3 for typed components, services, and models.
- ⚡ Vite 7.2.4 for local development and production builds.
- 🎨 Tailwind CSS 3.4.18 for styling.
- 🎞️ Framer Motion for animated UI transitions.
- 📊 Recharts for profile and analytics visualizations.
- 🔐 Clerk React for sign-in and session handling.
- 🧭 React Router for navigation and protected routes.

### Backend

- 🐍 Python with FastAPI for the API layer.
- 🚀 Uvicorn as the ASGI server.
- 🧰 Motor for async MongoDB access.
- 🧠 Transformers and PyTorch for sentiment and credibility ML services.
- 🤖 Ollama for chatbot responses.
- 🔊 Amazon Polly integration for TTS.
- 🌍 Deep-translator for translation support.

### Database

- 🍃 MongoDB for bookmarks, read later, comments, summaries, feedback, audit logs, training data, and profile analytics.
- 🧠 Redis for caching, hit counters, and request-response acceleration.

### DevOps

- 🧪 Pytest for backend verification.
- 🧹 ESLint and TypeScript checks for frontend quality.
- 📝 Structured logging and startup index creation in the backend.
- 🔄 Environment-driven configuration through `.env` files.
- 🚫 No Docker or CI workflow is committed in this repository scan; the build badge above is informational only.

## 📁 Project Structure

```text
NEWSAG/                           # Monorepo root for the full-stack NewsAura app
├── backend/                      # FastAPI backend, ML services, tests, and utilities
│   ├── app/                      # Application source code
│   │   ├── main.py              # FastAPI entrypoint, middleware, and router wiring
│   │   ├── core/                # Auth, cache, config, logging, database, and indexes
│   │   ├── models/              # Pydantic schemas and Mongo-facing models
│   │   ├── routers/             # API routes for news, summaries, bookmarks, admin, and more
│   │   └── services/            # Business logic, ML pipelines, chatbot, TTS, and integrations
│   ├── tests/                   # Pytest coverage for policy, metrics, streaks, and imports
│   ├── scripts/                 # Maintenance and migration helpers
│   └── requirements.txt         # Python dependency list
├── frontend/                     # React + TypeScript app
│   ├── src/                      # UI source code
│   │   ├── app/                 # App shell, router, and layout bootstrap
│   │   ├── components/          # Shared UI, layout, news, profile, and utility components
│   │   ├── hooks/               # Reusable React hooks
│   │   ├── lib/                 # Notification and helper utilities
│   │   ├── pages/               # Home, login, profile, bookmarks, admin, and tooling screens
│   │   ├── services/            # Axios API clients and feature-specific service wrappers
│   │   ├── utils/               # Constants and helper functions
│   │   ├── index.css            # Global styling and Tailwind entry styles
│   │   └── main.tsx             # Frontend bootstrap and Clerk provider setup
│   ├── public/                   # Static assets served by Vite
│   ├── package.json              # Frontend scripts and dependencies
│   ├── vite.config.ts            # Vite build and dev server config
│   └── tailwind.config.js        # Tailwind theme configuration
├── *.md                          # Project guides, feature notes, migration docs, and troubleshooting notes
└── diagnose.py                   # Local diagnostic helper
```

## ⚙️ Prerequisites

- 🐍 Python 3.9 or higher.
- 🟩 Node.js 18.0.0 or higher.
- 📦 npm 8.0.0 or higher.
- 🧰 Git 2.0 or higher.
- 🍃 MongoDB instance or cluster.
- 🧠 Redis server for caching and hit counters.
- 🔐 Clerk application for authentication.
- 📰 GNews API key for news retrieval.
- 🤖 Optional local Ollama server for the chatbot.
- ☁️ Optional AWS credentials if you want Amazon Polly TTS.

## 🚀 Getting Started

### 1) Clone the repository

```bash
git clone <repository-url>
cd NEWSAG
```

### 2) Configure the backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in `backend/` with the variables listed below, then start the API:

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend URLs:

- API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- Health: http://localhost:8000/health

### 3) Configure the frontend

```bash
cd ../frontend
npm install
```

Create a `.env` file in `frontend/` with the frontend variables listed below, then start the app:

```bash
npm run dev
```

Frontend URL:

- App: http://localhost:5173

### 4) Optional verification commands

```bash
# Frontend build and lint
cd frontend
npm run build
npm run lint

# Backend tests
cd ../backend
pytest
```

## 🔐 Environment Variables

### Backend

| Variable | Required | Example | Description |
|---|---:|---|---|
| `HOST` | No | `127.0.0.1` | Backend bind host. |
| `PORT` | No | `8000` | Backend bind port. |
| `MONGO_URI` | Yes | `mongodb://localhost:27017/newsaura` | MongoDB connection string. |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis cache connection string. |
| `CLERK_ISSUER` | Yes | `https://your-clerk-domain.clerk.accounts.dev` | Clerk issuer used for JWT validation. |
| `CLERK_AUDIENCE` | Yes | `your-clerk-audience` | Expected JWT audience. |
| `CLERK_API_KEY` | Yes for admin features | `sk_test_...` | Clerk Admin API key. |
| `ADMIN_USER_IDS` | No | `user_123,user_456` | Comma-separated admin allowlist. |
| `CLERK_ADMIN_METADATA_KEY` | No | `admin,role` | Comma-separated Metadata key used for admin checks. |
| `CLERK_ADMIN_ORG_ROLES` | No | `admin,owner` | Clerk org roles that grant admin access. |
| `JWKS_FAILURE_COOLDOWN_SECONDS` | No | `30` | JWKS retry cooldown after auth provider errors. |
| `GNEWS_API_KEY` | Yes | `your_gnews_key` | GNews API key used for news fetching. |
| `CACHE_TTL_NEWS` | No | `900` | Base news cache TTL in seconds. |
| `CACHE_TTL_NEWS_TOPIC` | No | `432000` | Topic cache TTL in seconds. |
| `GNEWS_REFRESH_INTERVAL_SEC` | No | `900` | Refresh interval for GNews data. |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Local Ollama server URL. |
| `OLLAMA_MODEL` | No | `llama3.2:1b` | Ollama model name used by the chatbot. |
| `OLLAMA_TIMEOUT` | No | `90` | Ollama request timeout in seconds. |
| `LOG_LEVEL` | No | `INFO` | Backend log level. |
| `LOG_FILE` | No | `logs/app.log` | Log file path. |
| `AWS_ACCESS_KEY_ID` | Optional | `AKIA...` | AWS credential for Polly. |
| `AWS_SECRET_ACCESS_KEY` | Optional | `...` | AWS secret key for Polly. |
| `AWS_REGION` | Optional | `ap-south-1` | AWS region for Polly. |
| `CLERK_API_BASE` | No | `https://api.clerk.com/v1` | Clerk API base URL. |
| `CLERK_COUNT_CACHE_TTL` | No | `30` | Clerk user count cache TTL. |

### Frontend

| Variable | Required | Example | Description |
|---|---:|---|---|
| `VITE_API_URL` | No | `http://localhost:8000` | Backend base URL for the frontend API client. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | `pk_test_...` | Clerk publishable key used by the React app. |
| `VITE_ENABLE_CHATBOT` | No | `true` | Optional feature flag from the example config. |
| `VITE_ENABLE_DARK_MODE` | No | `true` | Optional feature flag from the example config. |
| `VITE_ENABLE_ANALYTICS` | No | `true` | Optional feature flag from the example config. |
| `VITE_REDIS_URL` | No | `redis://localhost:6379` | Present in the example config; not currently consumed by the frontend code. |

## 📡 API Reference

Base URL: `http://localhost:8000/api`

| Method | Endpoint | Description | Auth required |
|---|---|---|---|
| GET | `/news/suggestions` | Search suggestions and discovery results. | No |
| GET | `/news/trending/headlines` | Trending headlines feed. | No |
| GET | `/news/topic/{topic}` | Topic-specific news feed. | No |
| GET | `/news/{category}` | Category feed with cached articles. | No |
| GET | `/news/status/hits` | GNews hit counter status. | No |
| POST | `/news/admin/reset-hits` | Reset hit counter. | Yes, admin |
| POST | `/news/refresh/{category}` | Refresh a category cache. | Yes, admin |
| POST | `/news/refresh-all` | Refresh all cached categories. | Yes, admin |
| GET | `/news/action-status` | Cached user action status for article keys. | Yes |
| POST | `/news/rate` | Rate an article for analytics. | Yes |
| POST | `/news/report` | Report a problematic article. | Yes |
| GET | `/summary/languages` | Supported summary translation languages. | No |
| POST | `/summary/` | Generate or fetch an article summary. | Yes, optional user context |
| POST | `/sentiment/` | Analyze text sentiment. | No |
| POST | `/comments/` | Add a comment to an article. | Yes |
| GET | `/comments/{article_id}` | Fetch article comments. | No |
| DELETE | `/comments/{comment_id}` | Delete a comment owned by the user. | Yes |
| POST | `/bookmarks/` | Add a bookmark. | Yes |
| GET | `/bookmarks/` | List the user’s bookmarks. | Yes |
| DELETE | `/bookmarks/` | Delete all bookmarks or a selected bookmark set. | Yes |
| DELETE | `/bookmarks/{bookmark_id}` | Delete one bookmark. | Yes |
| POST | `/read-later/` | Add a read-later item. | Yes |
| GET | `/read-later/` | List the user’s read-later items. | Yes |
| DELETE | `/read-later/` | Delete all read-later items or a selected item set. | Yes |
| DELETE | `/read-later/{item_id}` | Delete one read-later item. | Yes |
| POST | `/feedback/` | Submit feedback. | No |
| POST | `/profile/activity/read` | Log a read event. | Yes |
| GET | `/profile/stats` | User stats summary. | Yes |
| GET | `/profile/analytics` | Detailed profile analytics and badge data. | Yes |
| POST | `/chat/message` | Send a chatbot message. | Yes, optional user context |
| GET | `/chat/history` | Fetch chat history. | Yes, optional user context |
| GET | `/tts/languages` | Supported TTS languages. | No |
| POST | `/tts/generate` | Generate audio with Polly. | Yes |
| GET | `/tts/usage` | TTS usage stats. | Yes, admin |
| GET | `/tts/health` | TTS service health. | No |
| POST | `/admin/tuning/import/{model_type}` | Import training data CSV. | Yes, admin |
| POST | `/admin/tuning/import/validate/{model_type}` | Validate training CSV shape. | Yes, admin |
| GET | `/admin/training/stats` | Training data statistics. | Yes, admin |
| POST | `/admin/tuning/start` | Start a fine-tuning job. | Yes, admin |
| POST | `/admin/tuning/cancel/{job_id}` | Cancel a running tuning job. | Yes, admin |
| DELETE | `/admin/tuning/jobs/{job_id}` | Delete a tuning job record. | Yes, admin |
| GET | `/admin/tuning/jobs` | List tuning jobs. | Yes, admin |
| GET | `/admin/tuning/logs/{job_id}` | Stream or fetch tuning logs. | Yes, admin |
| GET | `/admin/tuning/metrics/{model_type}` | Model performance metrics. | Yes, admin |
| GET | `/admin/tuning/data-quality/{model_type}` | Data quality report. | Yes, admin |
| GET | `/admin/tuning/versions/{model_type}` | Model version history. | Yes, admin |
| GET | `/admin/reports/pending` | Pending credibility reports. | Yes, admin |
| POST | `/admin/reports/{report_id}/verify` | Verify a credibility report. | Yes, admin |
| GET | `/admin/feedback/sentiment` | Sentiment feedback collection. | Yes, admin |
| GET | `/admin/sentiment/trends` | Sentiment trends over time. | Yes, admin |
| GET | `/admin/sentiment/heatmap` | Sentiment heatmap data. | Yes, admin |
| PATCH | `/admin/feedback/sentiment/{feedback_id}/override-label` | Override a sentiment label. | Yes, admin |
| PATCH | `/admin/feedback/sentiment/{feedback_id}/flag` | Flag suspicious sentiment feedback. | Yes, admin |
| POST | `/admin/feedback/sentiment/{feedback_id}/reanalyze` | Re-analyze a feedback item. | Yes, admin |
| GET | `/admin/sentiment/anomaly-config` | Get anomaly detection config. | Yes, admin |
| PUT | `/admin/sentiment/anomaly-config` | Update anomaly detection config. | Yes, admin |
| GET | `/admin/sentiment/anomalies` | Detected sentiment anomalies. | Yes, admin |
| GET | `/admin/audit/logs` | Admin audit log entries. | Yes, admin |
| GET | `/admin/audit/activity-summary` | Admin activity summary. | Yes, admin |
| GET | `/admin/metrics` | System-wide metrics. | Yes, admin |
| GET | `/admin/metrics/hits` | GNews hit metrics. | Yes, admin |
| GET | `/admin/clerk-user-count` | Total Clerk user count. | Yes, admin |
| GET | `/admin/system/status` | System status snapshot. | Yes, admin |

## 🖼️ Screenshots

Add UI screenshots here after capturing the home feed, article viewer, bookmarks, read later, profile analytics, and admin dashboard.

## 🧪 Running Tests

### Backend

```bash
cd backend
pytest
pytest --cov=app tests/
pytest tests/test_badge_policy.py -v
```

### Frontend

```bash
cd frontend
npm run build
npm run lint
npm run type-check
```

The repository includes a frontend component test at `frontend/src/pages/Profile.test.tsx`, but no dedicated frontend test script is currently defined in `frontend/package.json`.

## 🤝 Contributing

1. Fork the repository.
2. Create a branch for your change.
3. Make focused commits with clear messages.
4. Run the relevant backend or frontend checks before opening a pull request.
5. Open a PR and describe what changed, why it changed, and how you verified it.

## 📄 License

No LICENSE file was present in the repository scan, so MIT is the default recommendation for this project.

If you want, add a `LICENSE` file at the repository root and update this section to match it.

```bash
export MONGODB_URI='mongodb://localhost:27017/newsag'
export REDIS_URL='redis://localhost:6379/0'
export GNEWS_API_KEY='...'
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend (React / Vite)

1. Install dependencies and start dev server:

```bash
cd frontend
npm install
npm run dev
# The app typically serves on http://localhost:5173
```

Notes
- The backend default port observed during development is `8000`, and the frontend Vite server commonly runs on `5173` in this repo (see dev run logs and screenshots).
- After changing backend models (for example adding fields to Pydantic models), restart the backend to pick up changes.

---

## Contributing / Notes for Reviewers

- The codebase is organized to separate HTTP routing, business services, and core infra helpers. When adding features, follow the existing pattern: routers call services, services use `core` helpers and `models` for validation and persistence.
- The project contains documentation files at the repo root (integration guides for GNews, Redis migration notes, and Clerk setup) — consult those for integration details and environment variable names.

---

If you want, I can:
- add a short architecture diagram in SVG/ascii to the docs,
- or run a quick read of `backend/app/routers/profile.py` and show the exact analytics output shape for a sample user.

This README was generated from the repository structure and inline code references. No external services or undocumented features were assumed.
