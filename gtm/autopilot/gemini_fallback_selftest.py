from __future__ import annotations

import json
import os
import urllib.error
from contextlib import contextmanager
from unittest.mock import patch

from agents import OpenAIChatCompletionsModel, WebSearchTool
from pydantic import ValidationError

import main as autopilot_main
import model_provider


@contextmanager
def _environment(**values: str | None):
    original = {name: os.environ.get(name) for name in values}
    try:
        for name, value in values.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        yield
    finally:
        for name, value in original.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


class _Headers(dict):
    def get(self, key, default=None):
        return super().get(key, default)


class _Response:
    def __init__(self, payload: dict):
        self._body = json.dumps(payload).encode()
        self.headers = _Headers({"Content-Length": str(len(self._body))})

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, amount: int) -> bytes:
        return self._body[:amount]


def _expect_system_exit(function, message: str) -> None:
    try:
        function()
    except SystemExit as exc:
        assert message in str(exc)
    else:
        raise AssertionError("expected SystemExit")


def main() -> None:
    with _environment(GTM_MODEL_PROVIDER=None):
        assert model_provider.selected_provider() == "openai"
    with _environment(GTM_MODEL_PROVIDER="invalid"):
        _expect_system_exit(model_provider.selected_provider, "must be 'openai' or 'gemini'")
    with _environment(GEMINI_API_KEY=None):
        _expect_system_exit(
            lambda: model_provider.validate_provider_credentials("gemini"),
            "GEMINI_API_KEY is required",
        )

    sentinel_key = "self-test-placeholder-key"
    with _environment(
        **{
            "GEMINI_API_KEY": sentinel_key,
            "GTM_GEMINI_MODEL": None,
            "ALL_PROXY": None,
            "all_proxy": None,
        }
    ):
        model = model_provider.runtime_model("gemini")
        assert isinstance(model, OpenAIChatCompletionsModel)
        assert model.model == model_provider.GEMINI_MODEL
        assert isinstance(model_provider.web_search_tool("openai"), WebSearchTool)
        assert model_provider.web_search_tool("gemini") is model_provider.gemini_grounded_web_search
        specialists = autopilot_main.build_agents(autopilot_main.load_agent_prompts(), model)
        orchestrator = autopilot_main.build_orchestrator(
            specialists, ["SEO"], model, "gemini", enable_web_search=True
        )
        assert orchestrator.model is model
        assert len(orchestrator.tools) == 2
        assert orchestrator.tools[-1] is model_provider.gemini_grounded_web_search
        assert orchestrator.model_settings.max_tokens == 24_000
        # The aggregate budget scales with the unit's own output contract and
        # the emit ceiling follows it, so a four-output section is not asked for
        # more than it can return.
        two_output = {"required_outputs": ["a.md", "a.json"]}
        four_output = {
            "required_outputs": ["a.md", "b.md", "b.json", "c.md"],
        }
        assert autopilot_main.artifact_aggregate_limit(two_output) == 55_000
        assert autopilot_main.artifact_aggregate_limit(four_output) == 72_000
        assert autopilot_main.artifact_aggregate_limit({}) == 55_000
        assert autopilot_main.artifact_aggregate_limit(
            {"required_outputs": ["x.md"] * 20}
        ) == 144_000
        assert autopilot_main.orchestrator_max_tokens(55_000) == 24_000
        assert autopilot_main.orchestrator_max_tokens(72_000) == 28_250
        assert autopilot_main.orchestrator_max_tokens(144_000) == 32_000
        runtime_source = (autopilot_main.CONFIG_ROOT / "autopilot" / "main.py").read_text()
        assert "at or below 40,000 characters" in runtime_source
        assert 'f"below {aggregate_limit:,} characters.' in runtime_source
        assert "at or below 10,000 characters" not in runtime_source
        artifact_schema = autopilot_main.ArtifactDocument.model_json_schema()
        assert "maxLength" not in artifact_schema["properties"]["content"]
        run_schema = autopilot_main.RunOutput.model_json_schema()
        assert "maxItems" not in run_schema["properties"]["artifact_documents"]
        try:
            autopilot_main.ArtifactDocument(
                relative_path="foundation/test.md", content="x" * 40_001
            )
        except ValidationError:
            pass
        else:
            raise AssertionError("oversized artifact content must fail validation")
        try:
            autopilot_main.RunOutput(
                run_status="PASS",
                executive_summary="bounded",
                artifact_documents=[
                    autopilot_main.ArtifactDocument(
                        relative_path=f"foundation/test-{index}.md", content="bounded"
                    )
                    for index in range(9)
                ],
                pass_condition_met=True,
                next_action="continue",
                founder_brief="bounded",
            )
        except ValidationError:
            pass
        else:
            raise AssertionError("oversized artifact list must fail validation")
        try:
            autopilot_main.RunOutput(
                run_status="PASS",
                executive_summary="bounded",
                artifact_documents=[
                    autopilot_main.ArtifactDocument(
                        relative_path="foundation/test-a.md", content="a" * 30_000
                    ),
                    autopilot_main.ArtifactDocument(
                        relative_path="foundation/test-b.md", content="b" * 30_000
                    ),
                ],
                pass_condition_met=True,
                next_action="continue",
                founder_brief="bounded",
            )
        except ValidationError:
            pass
        else:
            raise AssertionError("aggregate artifact content must fail validation")

        response = _Response(
            {
                "candidates": [
                    {
                        "content": {"parts": [{"text": "Verified current result."}]},
                        "groundingMetadata": {
                            "groundingChunks": [
                                {"web": {"title": "Official source", "uri": "https://example.com/rule"}},
                                {"web": {"title": "Unsafe", "uri": "http://example.com/unsafe"}},
                            ]
                        },
                    }
                ]
            }
        )

        captured = {}

        def fake_open(request, timeout):
            captured["url"] = request.full_url
            captured["key"] = request.headers.get("X-goog-api-key")
            captured["timeout"] = timeout
            return response

        with patch.object(model_provider._NO_REDIRECT_OPENER, "open", fake_open):
            result = json.loads(model_provider._gemini_grounded_search("current rule"))
        assert captured == {
            "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
            "key": sentinel_key,
            "timeout": 45,
        }
        assert result["grounded_summary"] == "Verified current result."
        assert result["sources"] == [
            {"title": "Official source", "url": "https://example.com/rule"}
        ]

        redirect = urllib.error.HTTPError(
            "https://generativelanguage.googleapis.com/redirect", 302, "redirect", {}, None
        )
        with patch.object(model_provider._NO_REDIRECT_OPENER, "open", side_effect=redirect):
            try:
                model_provider._gemini_grounded_search("current rule")
            except RuntimeError as exc:
                assert str(exc) == "Gemini grounded search returned HTTP 302."
                assert sentinel_key not in str(exc)
            else:
                raise AssertionError("redirect must fail closed")

        oversized = _Response({"candidates": []})
        oversized.headers["Content-Length"] = str(
            model_provider.MAX_SEARCH_RESPONSE_BYTES + 1
        )
        with patch.object(model_provider._NO_REDIRECT_OPENER, "open", return_value=oversized):
            try:
                model_provider._gemini_grounded_search("current rule")
            except RuntimeError as exc:
                assert "exceeded the size limit" in str(exc)
            else:
                raise AssertionError("oversized response must fail closed")

        with _environment(GTM_GEMINI_SEARCH_MODEL="../../unsafe"):
            try:
                model_provider._gemini_grounded_search("current rule")
            except RuntimeError as exc:
                assert str(exc) == "GTM_GEMINI_SEARCH_MODEL contains invalid characters."
            else:
                raise AssertionError("invalid model path must fail closed")

    print("PASS: opt-in Gemini fallback, credential isolation, and grounded-search contracts validated.")


if __name__ == "__main__":
    main()
