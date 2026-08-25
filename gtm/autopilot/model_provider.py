from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from typing import Any, Literal

from agents import (
    OpenAIChatCompletionsModel,
    WebSearchTool,
    function_tool,
)
from agents.tracing import set_trace_provider
from agents.tracing.provider import DefaultTraceProvider
from openai import AsyncOpenAI

ModelProviderName = Literal["openai", "gemini"]

OPENAI_MODEL = "gpt-5.6"
GEMINI_MODEL = "gemini-3.7-flash"
GEMINI_SEARCH_MODEL = "gemini-3.7-flash"
GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
MAX_SEARCH_QUERY_CHARS = 1200
MAX_SEARCH_RESPONSE_BYTES = 2_000_000


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Never forward the Gemini credential to a redirected host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        raise urllib.error.HTTPError(req.full_url, code, msg, headers, fp)


_NO_REDIRECT_OPENER = urllib.request.build_opener(_NoRedirectHandler())


def selected_provider() -> ModelProviderName:
    raw = os.getenv("GTM_MODEL_PROVIDER", "openai").strip().lower()
    if raw not in {"openai", "gemini"}:
        raise SystemExit("GTM_MODEL_PROVIDER must be 'openai' or 'gemini'.")
    return raw  # type: ignore[return-value]


def validate_provider_credentials(provider: ModelProviderName | None = None) -> None:
    provider = provider or selected_provider()
    env_name = "OPENAI_API_KEY" if provider == "openai" else "GEMINI_API_KEY"
    if not os.getenv(env_name, "").strip():
        raise SystemExit(f"{env_name} is required when GTM_MODEL_PROVIDER={provider}.")


def runtime_model(provider: ModelProviderName | None = None) -> str | OpenAIChatCompletionsModel:
    provider = provider or selected_provider()
    validate_provider_credentials(provider)
    if provider == "openai":
        return os.getenv("GTM_OPENAI_MODEL", OPENAI_MODEL).strip() or OPENAI_MODEL

    # Gemini is used only as an explicitly selected text-orchestration fallback.
    # Disable OpenAI tracing so the fallback never attempts a second provider call.
    trace_provider = DefaultTraceProvider()
    trace_provider.set_disabled(True)
    set_trace_provider(trace_provider)
    client = AsyncOpenAI(
        api_key=os.environ["GEMINI_API_KEY"].strip(),
        base_url=GEMINI_OPENAI_BASE_URL,
    )
    model_name = os.getenv("GTM_GEMINI_MODEL", GEMINI_MODEL).strip() or GEMINI_MODEL
    return OpenAIChatCompletionsModel(
        model=model_name,
        openai_client=client,
        strict_feature_validation=True,
    )


def _bounded_response(response: Any) -> bytes:
    content_length = response.headers.get("Content-Length")
    if content_length:
        try:
            if int(content_length) > MAX_SEARCH_RESPONSE_BYTES:
                raise RuntimeError("Gemini grounded-search response exceeded the size limit.")
        except ValueError as exc:
            raise RuntimeError("Gemini grounded-search response had an invalid length.") from exc
    body = response.read(MAX_SEARCH_RESPONSE_BYTES + 1)
    if len(body) > MAX_SEARCH_RESPONSE_BYTES:
        raise RuntimeError("Gemini grounded-search response exceeded the size limit.")
    return body


def _gemini_grounded_search(query: str) -> str:
    query = query.strip()
    if not query or len(query) > MAX_SEARCH_QUERY_CHARS:
        raise ValueError(
            f"Search query must contain 1-{MAX_SEARCH_QUERY_CHARS} characters."
        )
    validate_provider_credentials("gemini")

    payload = json.dumps(
        {
            "contents": [{"role": "user", "parts": [{"text": query}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 2400},
        }
    ).encode("utf-8")
    search_model = (
        os.getenv("GTM_GEMINI_SEARCH_MODEL", GEMINI_SEARCH_MODEL).strip()
        or GEMINI_SEARCH_MODEL
    )
    if not search_model.replace("-", "").replace(".", "").isalnum():
        raise RuntimeError("GTM_GEMINI_SEARCH_MODEL contains invalid characters.")
    generate_url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{search_model}:generateContent"
    )
    request = urllib.request.Request(
        generate_url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": os.environ["GEMINI_API_KEY"].strip(),
        },
    )
    try:
        with _NO_REDIRECT_OPENER.open(request, timeout=45) as response:
            body = _bounded_response(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(
            f"Gemini grounded search returned HTTP {exc.code}."
        ) from None
    except urllib.error.URLError:
        raise RuntimeError("Gemini grounded search could not reach its fixed API host.") from None

    try:
        data = json.loads(body)
        candidate = data["candidates"][0]
        parts = candidate["content"]["parts"]
        text = "\n".join(
            str(part.get("text", "")).strip()
            for part in parts
            if isinstance(part, dict) and part.get("text")
        ).strip()
        chunks = candidate.get("groundingMetadata", {}).get("groundingChunks", [])
        sources = []
        for chunk in chunks[:12]:
            web = chunk.get("web", {}) if isinstance(chunk, dict) else {}
            uri = str(web.get("uri", "")).strip()
            title = str(web.get("title", "")).strip()
            if uri.startswith("https://"):
                sources.append({"title": title[:200], "url": uri[:2000]})
        if not text:
            raise ValueError("missing grounded text")
    except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise RuntimeError("Gemini grounded search returned an invalid response.") from exc

    return json.dumps(
        {"query": query, "grounded_summary": text, "sources": sources},
        ensure_ascii=False,
    )


@function_tool(
    name_override="search_current_web",
    description_override=(
        "Search the current public web using Gemini Google Search grounding. "
        "Use for official rules, marketplace policies, current partners, and other "
        "time-sensitive claims. Treat returned URLs as evidence and mark claims "
        "UNVERIFIED when authoritative evidence is absent."
    ),
    strict_mode=True,
)
async def gemini_grounded_web_search(query: str) -> str:
    return await asyncio.to_thread(_gemini_grounded_search, query)


def web_search_tool(provider: ModelProviderName | None = None):
    provider = provider or selected_provider()
    if provider == "openai":
        return WebSearchTool(search_context_size="medium")
    return gemini_grounded_web_search
