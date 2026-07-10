# NexusAI – Full-Stack AI Chat App

ChatGPT-style chat powered by **Llama 3.3 70B via Groq**, with JWT auth, PostgreSQL persistence, SSE streaming, and Web Speech API voice I/O.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| State | Zustand |
| API client | Axios |
| Markdown | react-markdown + remark-gfm + react-syntax-highlighter |
| Backend | FastAPI, Python 3.11+ |
| Auth | JWT (python-jose) + bcrypt |
| DB | PostgreSQL via Neon (SQLAlchemy) |
| AI | Groq API – Llama 3.3 70B |
| Streaming | Server-Sent Events (SSE) |
| Voice | Web Speech API (no external API) |

## Backend file map

```
backend/
  main.py       ← FastAPI app wiring (CORS, router, init_db)
  database.py   ← SQLAlchemy models + session factory
  auth.py       ← JWT helpers, password hashing, get_current_user dep
  routes.py     ← All route handlers (auth, conversations, SSE chat)
  requirements.txt
  .env.example
```

## Frontend file map

```
frontend/src/
  main.tsx                     ← React entry point
  App.tsx                      ← Root layout + boot logic
  index.css                    ← Tailwind + aurora + glass utilities
  lib/api.ts                   ← Axios client + all API calls + types
  store/index.ts               ← Zustand global state
  hooks/useSpeech.ts           ← Web Speech API (STT + TTS)
  components/
    AuthPage.tsx               ← Login / register forms
    Sidebar.tsx                ← Conversation list, rename, delete
    ChatView.tsx               ← Message list, input bar, SSE streaming
    MessageBubble.tsx          ← Markdown bubble + copy + TTS replay
    VoicePanel.tsx             ← Voice/rate/pitch settings
```

---

## Quick Start

### 1. Prerequisites

- Python 3.11+
- Node.js 18+
- A [Neon](https://neon.tech) (or any Postgres) database
- A [Groq](https://console.groq.com) API key

### 2. Backend

```bash
cd backend

# Copy and fill env
cp .env.example .env
# Edit .env with your DATABASE_URL, SECRET_KEY, GROQ_API_KEY

# Create virtualenv and install
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run (tables are auto-created on first start)
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server (proxies /api → localhost:8000)
npm run dev
```

Open **http://localhost:5173**

### 4. Production build

```bash
# Frontend
cd frontend && npm run build   # outputs dist/

# Backend (serve with gunicorn/nginx or any ASGI host)
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## Environment variables

### backend/.env

```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
SECRET_KEY=your-super-secret-key
GROQ_API_KEY=gsk_...
ALLOWED_ORIGIN=http://localhost:5173
TAVILY_API_KEY=
```

---

## Features

- **Secure auth** – JWT (7-day) + bcrypt, auto-refresh on page load
- **Persistent history** – conversations + messages stored in PostgreSQL
- **Streaming** – SSE token-by-token response with typing indicator
- **Voice input** – browser mic via Web Speech API
- **Voice output** – TTS with voice/rate/pitch selection + replay per message
- **Markdown** – full GFM rendering with syntax-highlighted code blocks
- **Aurora UI** – animated blobs, glassmorphism cards, smooth animations
- **Responsive** – collapsible sidebar, mobile-friendly layout
- **Auto-title** – first user message becomes conversation title
