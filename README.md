# NexusAI

A full-stack AI chatbot built with **React, TypeScript,FastAPI,PostgreSQL, and Groq Llama 3.3 70B**. The application provides real-time AI conversations with authentication, persistent chat history, streaming responses, conversation branching, voice interaction, and chat sharing.


## Features

* JWT authentication
* Persistent conversation history
* Server-Sent Events (SSE) streaming
* Llama 3.3 70B via Groq
* Voice input & text-to-speech
* Automatic conversation titles
* Edit messages and regenerate responses
* Branching conversation support
* Public chat sharing
* Automatic web search for real-time queries

## Tech Stack

| Layer          | Technology                            |
| -------------- | ------------------------------------- |
| Frontend       | React, TypeScript, Vite, Tailwind CSS |
| Backend        | FastAPI, Python                       |
| Database       | PostgreSQL (Neon), SQLAlchemy         |
| Authentication | JWT, bcrypt                           |
| AI             | Groq Llama 3.3 70B                    |
| Streaming      | Server-Sent Events (SSE)              |
| Voice          | Web Speech API                        |

## Getting Started

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

```env
DATABASE_URL=
SECRET_KEY=
GROQ_API_KEY=
ALLOWED_ORIGIN=
TAVILY_API_KEY=
```

## License

This project is licensed under the MIT License.
