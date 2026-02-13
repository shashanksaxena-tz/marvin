# MARVIN Voice & Mobile Integration Design

**Date:** 2026-02-13
**Status:** Approved

---

## Overview

Add mobile-first voice and content capture to MARVIN through a dedicated Android app and Telegram bot. Both connect to a shared backend that processes input with Claude and syncs state with the existing desktop MARVIN via git.

## Goals

- Talk to MARVIN on the go (voice, text, images)
- Share content from any Android app (Instagram, Chrome, GitHub, Twitter, etc.) directly to MARVIN via share sheet
- MARVIN understands intent: capture vs task vs question vs content
- MARVIN connects incoming content to existing goals and projects
- Two-way conversation: MARVIN responds with summaries, confirmations, follow-up questions
- All state shared with desktop MARVIN through a single git repo

---

## Architecture

```
You (Android App) ──→
                      MARVIN Backend (Cloud) → Claude API
You (Telegram)   ──→        ↕
                        Git Repo (State)
                             ↕
                        Desktop MARVIN
```

### Three Frontends, One Backend

| Frontend | Best For |
|----------|----------|
| **Android App** | Share sheet (Instagram, Chrome, GitHub, etc.), voice-first capture, image sharing |
| **Telegram Bot** | Quick text messages, forwarding content, on-the-go thoughts |
| **Desktop MARVIN** | Deep work sessions, planning, full `/start` and `/end` workflow |

---

## Message Processing Pipeline

### Step 1: Normalize Input

| Input Type | Processing |
|---|---|
| Voice message | Transcribe via Groq Whisper → text |
| Text | Pass through as-is |
| Image/screenshot | Store image, send to Claude with vision |
| Shared link | Fetch the URL, extract content/metadata |
| Link + voice/text | Fetch URL AND process the accompanying note |

### Step 2: Claude Classifies Intent

Claude receives the processed input along with current state (goals, priorities, todos) and classifies as:

- **Capture** - Just storing a thought → Save to `content/inbox.md`, short confirmation
- **Task** - Do something / remind me / follow up → Add to `state/todos.md`, confirm with details
- **Question** - What do you think about X? → Thoughtful response, no state change
- **Content + Connect** - Here's a link/idea → Summarize, connect to goals/projects, save to `content/inbox.md`
- **Update** - Progress on a goal → Update relevant goal status in `state/goals.md`

### Step 3: Respond

Response adapts to classification:
- **Captures**: Short confirmation + any connections spotted
- **Tasks**: Confirms what it created
- **Questions**: Detailed, thoughtful answer
- **Content**: Summary + connections + confirmation

### Step 4: Persist

Commit any state changes to git and push. Desktop MARVIN sees them on next `/start`.

---

## Android App

### Screens

**1. Main Screen (Chat View)**
- Chat-style interface showing messages and MARVIN's responses
- Bottom bar with three actions:
  - Mic button (hold to record voice) - primary interaction
  - Text input for typing
  - Attachment button for images/files
- Messages show timestamps and classification tags

**2. Share Sheet Receiver**
- MARVIN appears in Android's share menu from ANY app
- Lightweight overlay (not the full app):
  - Preview of shared content (link, image, text)
  - Optional voice note or text for context
  - Send button
  - Response arrives as notification

**3. History / Search**
- Scroll through past captures and conversations
- Search by keyword, date, or project/goal
- Filter by type (captures, tasks, links, voice notes)

### Tech Stack
- **Kotlin + Jetpack Compose** - Modern Android UI
- **Retrofit** - HTTP client for backend API
- **Media recorder** - Voice capture
- **Share Sheet intent filter** - Receives shared content from other apps

### Notifications
- Proactive nudges ("You haven't updated BabyGo progress in 3 days")
- Responses to share sheet items arrive as expandable notifications

---

## Telegram Bot

### Supported Input

| You Send | What Happens |
|---|---|
| Text message | Sent directly to backend for processing |
| Voice message | Downloaded, transcribed via Groq Whisper |
| Photo/image | Downloaded, sent to Claude with vision |
| Forwarded message | Extracts text/media, processes as content capture |
| Link | Fetches URL, summarizes, connects to goals |

### Bot Commands

| Command | What It Does |
|---|---|
| `/status` | Quick summary of current priorities and open tasks |
| `/todos` | List active tasks |
| `/goals` | Show goals and progress |
| `/capture` | Force-capture mode (skip intent classification, just store) |

### Tech
- **grammY** (TypeScript Telegram framework)
- Webhook mode (Telegram pushes to backend)
- Same backend API as Android app

---

## Backend API

### Endpoints

| Endpoint | Purpose | Used By |
|---|---|---|
| `POST /message` | Text message | Android app |
| `POST /voice` | Audio file upload | Android app |
| `POST /share` | Shared content (URL, image, text + optional context) | Android app (share sheet) |
| `POST /telegram/webhook` | Telegram webhook receiver | Telegram |
| `GET /status` | Current priorities, todos, goals | Both |
| `GET /history` | Past captures and conversations | Android app |

### Core Services

| Service | What It Does | Tool |
|---|---|---|
| Transcription | Voice → text | Groq Whisper API (free, fast) |
| Content Fetcher | URL → extracted content/metadata | Cheerio / Playwright for JS-heavy sites |
| Claude Processor | Classify intent, generate response, decide state changes | Claude API (Sonnet for speed, Opus for deep questions) |
| State Manager | Read/write MARVIN state files | Direct file I/O on cloned repo |
| Git Sync | Commit and push state changes | simple-git library |

### Tech
- **Node.js (TypeScript)** on Railway/Fly.io
- Express or Fastify for API

### State Sync Flow

```
1. Backend starts → git pull (get latest state)
2. Message arrives → process with Claude
3. Claude says "add a task" → write to state/todos.md
4. git add + commit + push
5. Next desktop /start → git pull → sees new task
```

### Conflict Handling
- Backend always pulls before writing
- Desktop MARVIN is read-heavy (mostly `/start` reading state)
- Conflicts rare; backend does simple merge: append-only for captures, last-write-wins for status updates

---

## Environment Variables

```
CLAUDE_API_KEY=         # Anthropic API key
GROQ_API_KEY=           # For Whisper transcription
TELEGRAM_BOT_TOKEN=     # From @BotFather
GIT_REPO_URL=           # Your MARVIN repo (private)
GIT_TOKEN=              # For push access
```

---

## Cost Estimate

| Component | Cost |
|---|---|
| Railway/Fly.io | Free tier likely sufficient, ~$5/month if exceeded |
| Claude API | Sonnet for most messages, ~$5-15/month |
| Groq Whisper | Free tier is generous, likely $0 |
| **Total** | **~$5-20/month** |

---

## Implementation Order (Suggested)

1. **Backend API** - Core service with Claude integration and git sync
2. **Telegram Bot** - Quickest frontend to get working, validates the pipeline
3. **Android App** - Build once the backend is proven solid
4. **Polish** - Notifications, proactive nudges, search/history
