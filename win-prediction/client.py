"""DodgerWin chatbot: a local Ollama model that answers using the Kalshi MCP server.

Prereqs: `ollama serve` running and `ollama pull qwen2.5:7b`.
Run:     python client.py            (interactive)
         python client.py "Will the Dodgers win their next home game?"
Env:     OLLAMA_MODEL (default qwen2.5:7b)
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import ollama
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")
SERVER = Path(__file__).with_name("server.py")
MAX_TOOL_ROUNDS = 4

SYSTEM_PROMPT = """You are DodgerWin's friendly assistant for Los Angeles Dodgers fans.
Use the tools to answer questions about upcoming Dodgers home games and their win probability.
Rules:
- Never calculate, estimate, or guess a probability. Only report numbers a tool returned.
- If a tool returns "available": false, say plainly that no Kalshi probability is available
  yet and give the reason (and the game details, if any).
- Mention that the number comes from Kalshi prediction-market prices and is not a guarantee.
- Keep answers short: two or three sentences."""


def to_ollama_tools(mcp_tools) -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description or "",
                "parameters": t.input_schema or {"type": "object", "properties": {}},
            },
        }
        for t in mcp_tools
    ]


def tool_result_text(result) -> str:
    parts = [c.text for c in result.content if getattr(c, "type", None) == "text"]
    return "\n".join(parts) if parts else json.dumps(result.structured_content)


def clean_args(tools: list[dict], name: str, args) -> dict:
    """Keep only arguments the tool declares; small models often invent extras."""
    for t in tools:
        if t["function"]["name"] == name:
            allowed = t["function"]["parameters"].get("properties", {})
            return {k: v for k, v in dict(args or {}).items() if k in allowed}
    return {}


ChatMessage = dict | ollama.Message  # ollama.chat accepts either

async def ask(session: ClientSession, tools: list[dict], messages: list[ChatMessage]) -> str:
    for _ in range(MAX_TOOL_ROUNDS):
        resp = ollama.chat(model=MODEL, messages=messages, tools=tools)
        msg = resp.message
        messages.append(msg)
        if not msg.tool_calls:
            return msg.content or ""
        for call in msg.tool_calls:
            name, args = call.function.name, clean_args(tools, call.function.name,
                                                        call.function.arguments)
            print(f"  [tool] {name}({args})", file=sys.stderr)
            result = await session.call_tool(name, args)
            messages.append({"role": "tool", "tool_name": name, "content": tool_result_text(result)})
    return "Sorry, I couldn't finish looking that up."


async def main() -> None:
    params = StdioServerParameters(command=sys.executable, args=[str(SERVER)])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = to_ollama_tools((await session.list_tools()).tools)
            messages: list[ChatMessage] = [{"role": "system", "content": SYSTEM_PROMPT}]

            one_shot = " ".join(sys.argv[1:]).strip()
            while True:
                question = one_shot or input("\nYou: ").strip()
                if question.lower() in {"", "quit", "exit"}:
                    break
                messages.append({"role": "user", "content": question})
                print(f"\nDodgerWin: {await ask(session, tools, messages)}")
                if one_shot:
                    break


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, EOFError):
        pass
