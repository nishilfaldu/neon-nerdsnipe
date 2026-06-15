# Neon Nerdsnipe

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TanStack AI](https://img.shields.io/badge/TanStack%20AI-FF4154?style=flat-square&logo=reactquery&logoColor=white)](https://tanstack.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white)](https://openai.com/)
[![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)](https://zod.dev/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg?style=flat-square)](https://opensource.org/licenses/ISC)

> A take-home challenge from NEON that turned into a genuinely fun nerd snipe:
> dock with an interstellar space station over a noisy radio channel by building
> an AI agent that answers its authentication protocol — one fragmented
> transmission at a time.

A small TypeScript agent that connects to the NEON challenge WebSocket,
reconstructs each garbled transmission, hands it to an OpenAI-backed
[TanStack AI](https://tanstack.com/) agent, and transmits back exactly one JSON
object in the protocol NEON expects. If you got handed the same puzzle, or you
just want to see what a tiny tool-using agent looks like end to end, this is a
clean reference.

## The puzzle

You open a WebSocket to a space station called NEON. It will not just send you a
question — it sends each challenge as an **array of word fragments with
timestamps**, out of order, as if scrambled over a bad radio link:

```json
{
  "type": "challenge",
  "message": [
    { "word": "frequency", "timestamp": 3 },
    { "word": "the",       "timestamp": 1 },
    { "word": "authorization", "timestamp": 4 },
    { "word": "Respond",   "timestamp": 0 },
    { "word": "on",        "timestamp": 2 }
  ]
}
```

Sort by timestamp, join with spaces, and you get the real instruction. Answer
wrong even once and NEON severs the connection permanently — so the agent has to
be both correct and disciplined about its output format.

The challenges come in a handful of flavors:

| Challenge type | What NEON asks | Response |
|----------------|----------------|----------|
| **Handshake / vessel ID** | Enter a frequency or the vessel authorization code | `enter_digits` |
| **Computational assessment** | Evaluate an arithmetic expression (`+ - * / %`, parentheses, `Math.floor`) | `enter_digits` |
| **Knowledge archive** | Look up a Wikipedia article and return its Nth word | `speak_text` |
| **Crew manifest** | Answer a question about the crew from the manifest | `speak_text` |
| **Transmission verification** | Recall the Nth word of something you said earlier | `speak_text` |

## How it works

```text
        ┌─────────────────────────────────────────────────────────┐
        │                NEON challenge WebSocket                   │
        │     wss://neonhealth.software/agent-puzzle/challenge      │
        └───────────────┬──────────────────────────▲───────────────┘
                        │ scrambled fragments       │ one JSON object
                        ▼                           │
        ┌───────────────────────────┐               │
        │  reconstructMessage()      │   sort by timestamp, join
        │  helpers.ts                │
        └───────────────┬───────────┘
                        │ reconstructed challenge
                        ▼
        ┌─────────────────────────────────────────────┐
        │  TanStack AI agent (gpt-5.4-mini)             │
        │  prompt.ts  → NEON protocol + crew manifest   │
        │                                               │
        │  tools.ts:                                    │
        │   • code mode (QuickJS isolate) for math      │
        │   • knowledgeArchive → Wikipedia summary      │
        │   • getNthWordFromTransmissionHistory         │
        └───────────────┬───────────────────────────────┘
                        │ raw reply
                        ▼
        ┌───────────────────────────┐
        │  NeonResponseZodSchema     │   validate shape before sending
        │  types.ts                  │
        └───────────────┬───────────┘
                        │ validated response  ─────────► back to NEON
                        ▼
              transmissionHistory[]   (so verification challenges can look back)
```

A few details worth calling out:

- **Reconstruction always happens first.** Every message is sorted by timestamp
  before the agent ever sees it — the system prompt is emphatic about this
  because responding to raw fragments is an instant fail.
- **Math runs in a sandbox.** Arithmetic challenges are evaluated with TanStack
  AI's code mode inside a [QuickJS](https://github.com/justjake/quickjs-emscripten)
  isolate rather than trusting the model to do mental math.
- **Memory matters.** Some checkpoints ask you to recall a word from an earlier
  transmission, so every validated response is stored in `transmissionHistory`
  and replayed into the prompt when a verification challenge shows up.
- **Output is validated.** NEON's protocol parser is unforgiving, so replies are
  parsed through a Zod discriminated union before being transmitted.

## Tech stack

- **TypeScript** on Node
- **TanStack AI** with the OpenAI adapter for the agent loop
- **TanStack AI code mode** + **QuickJS isolate** for sandboxed arithmetic
- **Zod** for response typing and validation

## Setup

Install dependencies:

```bash
npm install
```

Add your OpenAI API key to an untracked env file (`.env*` is gitignored):

```bash
# .env.local
OPENAI_API_KEY=your_key_here
```

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Run the agent from `src/index.ts` with `tsx` + `nodemon` |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm start` | Run the compiled agent from `dist/index.js` |

## Project structure

```text
src/
  index.ts     WebSocket connection and challenge loop
  helpers.ts   Fragment reconstruction
  prompt.ts    NEON protocol system prompt and crew manifest
  tools.ts     TanStack AI tools and code-mode setup
  types.ts     Shared payload and response types (Zod schemas)
```

## Response format

Every final answer sent to NEON is exactly one JSON object matching the
requested type:

```json
{ "type": "enter_digits", "digits": "1234" }
```

or:

```json
{ "type": "speak_text", "text": "example" }
```

No markdown, no preamble, no second object — just the one transmission NEON is
waiting for.
