# DodgerWin: Kalshi Win-Probability MCP Server
 
*Implementation plan for the "AI winning statistic bot" (Section 6 of the DodgerWin project documentation, CPSC 454)*
 
---
 
## 1. Overview
 
This document describes how to add a feature that shows the **probability that the Los Angeles Dodgers win their next home game(s)**. The numbers come from **Kalshi**, a CFTC-regulated prediction market where each MLB game is listed as a yes/no contract. A contract trading at $0.62 means the market puts the outcome at about 62%.
 
The feature has three parts:
 
| Part | What it does | Cost |
|---|---|---|
| **MCP server** (`server.py`) | Python service exposing tools such as `dodgers_home_win_probability`. It reads Kalshi's public market data and the MLB schedule. | Free |
| **Free LLM** (Ollama + Qwen 2.5 / Llama 3.1) | The "AI bot." It calls the MCP tools and turns the numbers into a short, friendly answer. | Free (runs locally) |
| **AWS integration** | A scheduled Lambda stores the latest probability in DynamoDB so the React site can display it. | Fits in AWS Free Tier |
 
### Why MCP?
 
The **Model Context Protocol (MCP)** is an open standard for giving language models tools. We write the Kalshi logic once as an MCP server, and then *any* MCP-capable client can use it: our own Ollama chatbot, the MCP Inspector for testing, or another model later. The LLM does not have to know anything about Kalshi's API.
 
### "Scraping" Kalshi: use the public API, not HTML
 
Kalshi publishes **public market-data endpoints that need no API key or account**. Using them is more reliable than parsing kalshi.com's HTML, which changes often and is rendered with JavaScript. It is also the approach Kalshi supports. All the code below uses:
 
```
https://api.elections.kalshi.com/trade-api/v2
```
 
Only read-only `GET` endpoints are used. No trading, no authentication, no personal data.
 
---
 
## 2. Architecture
 
```
                    ┌────────────────────────────────────┐
  User question ──► │  MCP Client + Free LLM (Ollama)    │
  "Will the Dodgers │  model: qwen2.5:7b / llama3.1:8b   │
   win tonight?"    └───────────────┬────────────────────┘
                                    │ MCP (stdio, JSON-RPC)
                    ┌───────────────▼────────────────────┐
                    │  DodgerWin Kalshi MCP Server       │
                    │  tools:                            │
                    │   • next_dodgers_home_game         │
                    │   • dodgers_home_win_probability   │
                    │   • upcoming_home_win_probabilities│
                    └───────┬───────────────────┬────────┘
                            │                   │
             ┌──────────────▼─────┐   ┌─────────▼──────────────┐
             │ MLB Stats API      │   │ Kalshi public API      │
             │ (schedule, home/   │   │ series KXMLBGAME       │
             │  away, game dates) │   │ (prices → probability) │
             └────────────────────┘   └────────────────────────┘
```
 
**Why two data sources?** Kalshi tells us the *price*. The free MLB Stats API (`statsapi.mlb.com`) tells us *which games are Dodgers home games* and when they start. Using the official schedule to decide "home game" is safer than guessing from Kalshi ticker strings.
 
### How Kalshi organizes MLB games
 
- **Series:** `KXMLBGAME`, which holds all single-game MLB winner markets.
- **Event:** one game. The ticker encodes the date and the two teams, e.g. `KXMLBGAME-26APR07LADTOR` (date `26APR07` = 2026-04-07, then team codes).
- **Markets:** each event has two markets, one per team (e.g. `...-LAD` and `...-TOR`). The **YES price of the Dodgers market is the implied probability that the Dodgers win.**
> !! **Check the ticker format against live data before relying on it.** Look at a few current `KXMLBGAME` events. Confirm the date format, the team-code order (away/home), and whether doubleheaders add a start time to the ticker. The code below matches events by **date + "LAD"** and uses the MLB schedule for home/away, so small format differences won't break it.
 
---
 
## 3. Choosing a Free Model
 
The model only needs to (1) decide to call a tool and (2) summarize the JSON it gets back. A small model that supports **tool/function calling** is enough.
 
| Option | How it's free | Good for | Notes |
|---|---|---|---|
| **Ollama + `qwen2.5:7b`** *(recommended)* | Open weights, runs on your laptop | Development, demos | Reliable tool calling; needs ~8 GB RAM |
| **Ollama + `llama3.1:8b`** | Open weights, local | Development | Also supports tool calling |
| **Ollama + `qwen2.5:3b` / `llama3.2:3b`** | Local | Weaker laptops | Faster, slightly less reliable tool choice |
| **Groq free tier** | Free API key with rate limits | Calling from AWS Lambda | Hosts open models (Llama, Qwen) behind an OpenAI-compatible API |
| **Google Gemini free tier** | Free API key with rate limits | Calling from AWS Lambda | Supports function calling |
| **OpenRouter `:free` models** | Free with rate limits | Trying several models | Availability changes often |
 
**Recommendation:** use **Ollama locally** for development and the class demo (zero cost, no keys). If the bot has to run inside AWS, call a **hosted free tier** (Groq or Gemini) from Lambda, because Lambda can't run Ollama. Free-tier limits change, so check each provider's current terms before relying on one.
 
**Important design rule:** the LLM **never calculates or guesses probabilities**. It only repeats what the tool returns. This prevents made-up numbers.
 
---
 
## 4. Setup
 
### 4.1 Prerequisites
 
- Python 3.10+
- [Ollama](https://ollama.com) installed
- Node.js (only for the optional MCP Inspector)
### 4.2 Install
 
```bash
mkdir dodgerwin-mcp && cd dodgerwin-mcp
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install "mcp[cli]" httpx ollama
 
ollama pull qwen2.5:7b
```
 
### 4.3 Project layout
 
```
dodgerwin-mcp/
├── kalshi_core.py     # pure functions: schedule + Kalshi lookups (reused by Lambda)
├── server.py          # MCP server wrapping kalshi_core as tools
├── client.py          # chatbot: Ollama model + MCP client
└── tests/
    └── test_core.py
```
 
Keeping the logic in `kalshi_core.py` (separate from MCP) means the **same code** runs in the MCP server *and* in the AWS Lambda, without the LLM.
 
---