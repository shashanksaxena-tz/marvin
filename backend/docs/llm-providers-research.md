# LLM API Providers Research

> Last updated: 2026-02-13
> Scope: 3 active providers for MARVIN multi-LLM orchestrator

This document covers the three LLM API providers selected for the MARVIN orchestrator: Groq (existing), Google Gemini (complex tasks + web search), and Cerebras (ultra-fast fallback).

---

## Table of Contents

1. [Groq (Existing)](#1-groq-existing)
2. [Google Gemini](#2-google-gemini)
3. [Cerebras](#3-cerebras)
4. [Provider Comparison Matrix](#4-provider-comparison-matrix)
5. [Orchestrator Routing Strategy](#5-orchestrator-routing-strategy)
6. [Environment Variables](#6-environment-variables)

---

## 1. Groq (Existing)

### Role in Orchestrator
**Default provider** for simple/fast tasks, intent classification, and Whisper audio transcription. Already integrated in the codebase.

### Overview
Groq offers ultra-fast LPU (Language Processing Unit) inference with a generous free tier. OpenAI-compatible API. Currently powers all MARVIN LLM calls and audio transcription via Whisper.

### API Configuration

| Property | Value |
|----------|-------|
| **API Base URL** | `https://api.groq.com/openai/v1` |
| **Chat Endpoint** | `POST /chat/completions` |
| **Auth Header** | `Authorization: Bearer <GROQ_API_KEY>` |
| **OpenAI Compatible** | Yes (fully compatible) |
| **npm Package** | `groq-sdk` (official) or use `openai` SDK with custom baseURL |
| **API Key Source** | https://console.groq.com/ |
| **Env Var** | `GROQ_API_KEY` |

### Free Tier Rate Limits

#### Chat Models

| Model ID | RPM | RPD | TPM | TPD | Speed |
|----------|-----|-----|-----|-----|-------|
| `llama-3.3-70b-versatile` | 30 | 1,000 | 12,000 | 100,000 | 280 T/s |
| `llama-3.1-8b-instant` | 30 | 14,400 | 6,000 | 500,000 | 560 T/s |
| `meta-llama/llama-4-scout-17b-16e-instruct` | 30 | 14,400 | - | - | 750 T/s |
| `meta-llama/llama-4-maverick-17b-128e-instruct` | 30 | 14,400 | - | - | - |
| `openai/gpt-oss-120b` | 30 | 14,400 | - | - | 500 T/s |
| `moonshotai/kimi-k2-instruct` | 30 | 14,400 | - | - | 200 T/s |
| `qwen/qwen3-32b` | 30 | 14,400 | - | - | 400 T/s |

#### Audio/Transcription Models

| Model ID | RPM | RPD | Audio Seconds/Hour | Audio Seconds/Day |
|----------|-----|-----|--------------------|-------------------|
| `whisper-large-v3` | 20 | 2,000 | 7,200 | 28,800 |
| `whisper-large-v3-turbo` | 20 | 2,000 | 7,200 | 28,800 |

#### Compound/Agentic Systems

| Model ID | Description | Speed |
|----------|-------------|-------|
| `groq/compound` | Agentic AI with web search + code execution | 450 T/s |
| `groq/compound-mini` | Lighter agentic system | 450 T/s |

**Notes:**
- Cached tokens do NOT count towards rate limits
- Limits apply organization-wide; hitting any single threshold ends access
- `llama-3.3-70b-versatile` has the lowest TPD (100K) - watch this for heavy usage

### Current MARVIN Models
- **Chat**: `llama-3.3-70b-versatile` (set via `GROQ_MODEL`)
- **Vision**: `meta-llama/llama-4-scout-17b-16e-instruct` (set via `GROQ_VISION_MODEL`)
- **Transcription**: `whisper-large-v3` (hardcoded in transcription.ts)

### Feature Support

| Feature | Supported | Notes |
|---------|-----------|-------|
| Function Calling | Yes | Up to 128 functions, parallel tool calls supported |
| JSON Mode | Yes | `response_format: { type: "json_object" }` (already used in MARVIN) |
| Structured Outputs | Yes | JSON schema enforcement available |
| Vision | Yes | Via Llama 4 Scout (multimodal, images) |
| Streaming | Yes | SSE streaming with tool use support |
| Web Search / Grounding | Yes* | Via `groq/compound` agentic system (not standard chat) |
| Audio Transcription | Yes | Whisper Large V3 / V3 Turbo |

### Existing Code Reference
- Config: `backend/src/config.ts` (lines 19-22)
- LLM calls: `backend/src/services/claude-processor.ts` (lines 138-196)
- Transcription: `backend/src/services/transcription.ts`

### Request Example (already in codebase)
```javascript
const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${config.groqApiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: config.groqModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 1024,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  }),
});
```

---

## 2. Google Gemini

### Role in Orchestrator
**Complex reasoning provider** for tasks requiring web search grounding, vision/multimodal, advanced reasoning, and function calling. The "smart" tier of the orchestrator.

### Overview
Google's Gemini API via AI Studio offers a generous free tier with access to state-of-the-art models. The key differentiator is **Google Search grounding** - the ability to ground responses in real-time web search results. Also supports function calling, structured outputs, vision, and streaming.

### API Configuration

| Property | Value |
|----------|-------|
| **API Base URL (OpenAI-compat)** | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| **API Base URL (Native)** | `https://generativelanguage.googleapis.com/v1beta/` |
| **Chat Endpoint** | `POST /chat/completions` (OpenAI-compat) |
| **Auth Header** | `Authorization: Bearer <GEMINI_API_KEY>` |
| **OpenAI Compatible** | Yes (via `/v1beta/openai/` path) |
| **npm Package** | `@google/genai` (official native SDK) or `openai` SDK with custom baseURL |
| **API Key Source** | https://aistudio.google.com/apikey |
| **Env Var** | `GEMINI_API_KEY` |

### Free Tier Rate Limits

| Model | RPM | TPM | RPD | Context |
|-------|-----|-----|-----|---------|
| `gemini-2.5-pro` | 5 | 250,000 | 100 | 1M tokens |
| **`gemini-2.5-flash`** | **10** | **250,000** | **250** | **1M tokens** |
| `gemini-2.5-flash-lite` | 15 | 250,000 | 1,000 | 1M tokens |
| `gemini-2.0-flash` | 5 | - | - | **DEPRECATED Mar 31, 2026** |

- RPM/TPM use a rolling 60-second window
- RPD resets at midnight Pacific Time
- Free tier limits were reduced in Dec 2025 (50-92% cuts depending on model)

### Primary Model
**`gemini-2.5-flash`** - Best balance of capability (10 RPM, 250 RPD, 250K TPM, 1M context).

> **IMPORTANT**: The .env currently has `GEMINI_MODEL=gemini-2.0-flash` which is **deprecated** and shutting down March 31, 2026. Should be updated to `gemini-2.5-flash`.

### Feature Support

| Feature | Supported | Notes |
|---------|-----------|-------|
| Function Calling | Yes | Full OpenAI-compatible tool/function calling |
| JSON Mode | Yes | `response_mime_type: "application/json"` + JSON schema |
| Structured Outputs | Yes | Via `response_schema` parameter |
| Vision | Yes | Images, video, audio, PDF input |
| Streaming | Yes | SSE streaming supported |
| **Web Search / Grounding** | **Yes** | **`google_search` tool - unique differentiator** |
| Code Execution | Yes | Built-in code execution sandbox |
| Caching | Yes | Context caching for repeated prompts |

### Key Integration Notes

#### OpenAI-Compatible Mode
Use for standard chat completions, function calling, and JSON mode. Simpler integration using the `openai` npm package.

```javascript
import OpenAI from 'openai';

const gemini = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
});

const response = await gemini.chat.completions.create({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Hello' }],
  response_format: { type: 'json_object' },
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather',
      parameters: { type: 'object', properties: { city: { type: 'string' } } }
    }
  }]
});
```

**Limitations of OpenAI-compat mode:**
- Only Chat Completions and Embeddings endpoints available
- No access to Google Search grounding
- No access to code execution
- Limited vision support compared to native SDK

#### Native SDK Mode (Required for Web Search Grounding)
Use the `@google/genai` package for full feature access including web search grounding.

```javascript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Web search grounding
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'What are the latest developments in AI this week?',
  config: {
    tools: [{ googleSearch: {} }]
  }
});

// Function calling via native SDK
const response2 = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'What is the weather in NYC?',
  config: {
    tools: [{
      functionDeclarations: [{
        name: 'get_weather',
        description: 'Get current weather for a location',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city']
        }
      }]
    }]
  }
});
```

### Error Handling
- **429 Too Many Requests**: Rate limit exceeded - trigger fallback to Cerebras
- **400 Bad Request**: Usually malformed request - log and retry with simplified params
- **500 Internal Server Error**: Temporary Google issue - retry with exponential backoff

### Important Notes
- **Gemini 2.0 Flash is DEPRECATED** - must use 2.5 Flash
- Gemini 3.0 Flash/Pro are in preview (`gemini-3-flash-preview`, `gemini-3-pro-preview`)
- For web search grounding, MUST use native `@google/genai` SDK, not OpenAI-compat endpoint
- Free tier: 250 RPD is sufficient for personal assistant use (~250 complex queries/day)
- Consider `gemini-2.5-flash-lite` (1,000 RPD) for intent classification if Groq is rate-limited

---

## 3. Cerebras

### Role in Orchestrator
**Ultra-fast fallback provider** when Groq or Gemini are rate-limited. Also useful for speed-critical tasks where latency matters most. Claims ~20x faster than NVIDIA inference.

### Overview
Cerebras offers exceptionally fast inference on their custom Wafer-Scale Engine hardware. The free tier provides 1M tokens/day with 30 RPM. OpenAI-compatible API. Supports function calling, JSON mode, and structured outputs.

### API Configuration

| Property | Value |
|----------|-------|
| **API Base URL** | `https://api.cerebras.ai/v1` |
| **Chat Endpoint** | `POST /chat/completions` |
| **Auth Header** | `Authorization: Bearer <CEREBRAS_API_KEY>` |
| **OpenAI Compatible** | Yes (mostly compatible) |
| **npm Package** | Use `openai` SDK with custom baseURL |
| **API Key Source** | https://cloud.cerebras.ai/ |
| **Env Var** | `CEREBRAS_API_KEY` |

### Free Tier Rate Limits

| Metric | Standard Models | zai-glm-4.7 |
|--------|----------------|--------------|
| **RPM** | 30 | 10 |
| RPH | 900 | 100 |
| **RPD** | 14,400 | 100 |
| **TPM** | 60,000 | 60,000 |
| TPH | 1,000,000 | 1,000,000 |
| **TPD** | 1,000,000 | 1,000,000 |

### Available Free Tier Models

| Model ID | Description | Status |
|----------|-------------|--------|
| **`llama-3.3-70b`** | Llama 3.3 70B | **DEPRECATING Feb 16, 2026** |
| `llama3.1-8b` | Llama 3.1 8B | Active |
| `qwen-3-32b` | Qwen 3 32B | **DEPRECATING Feb 16, 2026** |
| **`qwen-3-235b-a22b-instruct-2507`** | Qwen 3 235B MoE | Active (recommended) |
| **`gpt-oss-120b`** | OpenAI GPT-OSS 120B | Active (recommended) |
| `zai-glm-4.7` | Zhipu GLM 4.7 | Active (lower limits) |

### Current MARVIN Config
The .env has `CEREBRAS_MODEL=llama-3.3-70b` which is **deprecating Feb 16, 2026**. Should be updated to `gpt-oss-120b` or `qwen-3-235b-a22b-instruct-2507`.

### Recommended Models
1. **`gpt-oss-120b`** - OpenAI's open-source model, 120B params, strong general capability
2. **`qwen-3-235b-a22b-instruct-2507`** - Largest MoE model, 235B total / 22B active params

### Feature Support

| Feature | Supported | Notes |
|---------|-----------|-------|
| Function Calling | Yes | Tool use with function definitions (max 64 char function name) |
| JSON Mode | Yes | `json_object` and `json_schema` with strict mode |
| Structured Outputs | Yes | Schema enforcement available |
| Vision | **No** | Text-only models |
| Streaming | Yes | **NOT compatible with JSON mode** (`stream: false` required for JSON) |
| Web Search / Grounding | **No** | Not supported |

### Key Integration Notes

#### Critical Limitation: No Streaming + JSON Mode
Cerebras does NOT support streaming when using JSON mode. When using `response_format: { type: "json_object" }`, you MUST set `stream: false`. This is important for the orchestrator to handle correctly.

#### Unsupported Parameters
- `presence_penalty` - Not supported, will error
- `text` completions endpoint - Not supported (chat completions only)

#### Context Length
- Default: 8,192 tokens on free tier
- Extended: Up to 128K available upon request

### Request Example
```javascript
import OpenAI from 'openai';

const cerebras = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY,
  baseURL: 'https://api.cerebras.ai/v1'
});

const response = await cerebras.chat.completions.create({
  model: 'gpt-oss-120b',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ],
  max_tokens: 1024,
  temperature: 0.7,
  response_format: { type: 'json_object' },
  stream: false, // REQUIRED when using JSON mode on Cerebras
});
```

### Error Handling
- **429 Too Many Requests**: Rate limit hit - trigger fallback to Groq
- **400 Bad Request**: Check for unsupported params (presence_penalty, streaming+JSON)
- Rate limiting triggered by whichever metric (RPM, TPM, TPH, etc.) is exhausted first

### Important Notes
- **`llama-3.3-70b` deprecating Feb 16, 2026** - update CEREBRAS_MODEL to `gpt-oss-120b`
- Ultra-fast inference is the key differentiator - great for quick fallback responses
- 30 RPM / 14,400 RPD is very generous for a fallback provider
- 1M TPD = ~1,000 substantial responses per day
- No vision support - vision tasks must go to Gemini or Groq
- Context limited to 8K tokens by default (vs Groq 131K, Gemini 1M)

---

## 4. Provider Comparison Matrix

### Rate Limits

| Provider | Model | RPM | RPD | TPD | Context | Speed |
|----------|-------|-----|-----|-----|---------|-------|
| **Groq** | llama-3.3-70b-versatile | 30 | 1,000 | 100,000 | 131K | 280 T/s |
| **Gemini** | gemini-2.5-flash | 10 | 250 | ~62.5M* | 1M | Fast |
| **Cerebras** | gpt-oss-120b | 30 | 14,400 | 1,000,000 | 8K | Ultra-fast |

*Gemini TPD estimate: 250 RPD x 250K TPM theoretical max, but realistically limited by RPD.

### Feature Matrix

| Feature | Groq | Gemini | Cerebras |
|---------|------|--------|----------|
| **Function Calling** | Yes (128 fn) | Yes | Yes (64 char name max) |
| **JSON Mode** | Yes | Yes | Yes (no streaming) |
| **Structured Outputs** | Yes | Yes | Yes |
| **Vision** | Yes (Llama 4 Scout) | Yes (native multimodal) | **No** |
| **Streaming** | Yes | Yes | Yes (not with JSON) |
| **Web Search** | Partial (compound) | **Yes (grounding)** | **No** |
| **Audio/Transcription** | **Yes (Whisper)** | No | No |
| **OpenAI Compatible** | Yes | Yes (+ native SDK) | Mostly |

### Best Use Cases

| Provider | Best For | Avoid For |
|----------|----------|-----------|
| **Groq** | Intent classification, simple Q&A, audio transcription, vision (Llama 4 Scout) | Complex reasoning, web search |
| **Gemini** | Web search grounding, complex reasoning, vision analysis, long context | High-volume simple tasks (250 RPD limit) |
| **Cerebras** | Fast fallback when others rate-limited, speed-critical responses | Vision tasks, web search, long context (8K limit) |

---

## 5. Orchestrator Routing Strategy

### Routing Priority

```
Message In
    |
    v
[Groq: Intent Classification] (fast, cheap, 30 RPM)
    |
    v
Classification Result
    |
    +---> Simple Q&A / Task / Capture / Update
    |         |
    |         v
    |     [Groq] (default, fast)
    |         |-- on 429 --> [Cerebras] (fallback)
    |         |-- on error --> [Cerebras] (fallback)
    |
    +---> Complex Reasoning / Analysis
    |         |
    |         v
    |     [Gemini] (smart provider)
    |         |-- on 429 --> [Groq with enhanced prompt]
    |         |-- on error --> [Cerebras] (fallback)
    |
    +---> Web Search / Current Info
    |         |
    |         v
    |     [Gemini with Google Search grounding]
    |         |-- on 429 --> [Groq/Cerebras without search] + note limitation
    |
    +---> Vision / Image Analysis
    |         |
    |         v
    |     [Groq with Llama 4 Scout]
    |         |-- on 429 --> [Gemini vision]
    |
    +---> Audio Transcription
              |
              v
          [Groq Whisper] (only option)
```

### Rate Limit Budget (Daily)

| Provider | RPD | Suggested Allocation |
|----------|-----|---------------------|
| **Groq** | 1,000 | ~800 for classification + simple tasks, ~200 for vision |
| **Gemini** | 250 | ~200 for complex/search tasks, ~50 reserve |
| **Cerebras** | 14,400 | ~14,400 as fallback (most generous, use freely) |

### Fallback Chain
1. **Primary**: Groq (simple) or Gemini (complex/search)
2. **First fallback**: Cerebras (ultra-fast, generous limits)
3. **Second fallback**: Groq <-> Gemini cross-fallback
4. **Final fallback**: Return cached/simplified response with error note

---

## 6. Environment Variables

### Current .env Configuration
```env
# Groq (existing - LLM + Whisper transcription)
GROQ_API_KEY=<set>
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# Google Gemini (complex reasoning, web search, vision)
GEMINI_API_KEY=<set>
GEMINI_MODEL=gemini-2.0-flash  # WARNING: Should be gemini-2.5-flash (2.0 deprecated)

# Cerebras (ultra-fast fallback)
CEREBRAS_API_KEY=<set>
CEREBRAS_MODEL=llama-3.3-70b  # WARNING: Deprecating Feb 16, 2026, use gpt-oss-120b

# Orchestrator
ORCHESTRATOR_MODE=smart  # smart (auto-route) | single (use LLM_PROVIDER only)
```

### Recommended .env Updates
```env
GEMINI_MODEL=gemini-2.5-flash          # Updated from deprecated 2.0-flash
CEREBRAS_MODEL=gpt-oss-120b            # Updated from deprecating llama-3.3-70b
```

### npm Packages Needed
```json
{
  "@google/genai": "latest",    // Gemini native SDK (for web search grounding)
  "openai": "latest"            // OpenAI SDK (for Cerebras + Gemini OpenAI-compat)
}
```
Note: `openai` package may already be installed. Groq uses direct `fetch` calls currently. Cerebras can use the `openai` SDK with custom baseURL. The `@google/genai` package is needed specifically for Gemini's web search grounding feature which is not available via the OpenAI-compatible endpoint.

---

## Appendix: Removed Providers

The following providers were researched but **removed from scope**:

| Provider | Reason Removed |
|----------|---------------|
| **OpenRouter** | No free credits available; 50 RPD too low without purchase |
| **Together.ai** | Paid only; free endpoints have 0.6 RPM (too slow) |
| **Moonshot/Kimi** | 3 RPM free tier inadequate; better accessed via OpenRouter |
| **Zhipu AI (Z.AI)** | Free Flash models available but adds complexity without clear benefit given Cerebras already serves GLM-4.7 |

Full research on these providers is preserved in git history.
