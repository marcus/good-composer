"""LLM client for streaming content generation via LiteLLM."""

import logging
from typing import AsyncGenerator
import litellm

log = logging.getLogger(__name__)


class LLMClient:
    """Streaming LLM client supporting Ollama and OpenRouter."""

    def __init__(
        self,
        model: str = "gpt-oss:20b",
        provider: str = "ollama",
        api_base: str = "http://localhost:11434",
        max_tokens: int = 100000,
        temperature: float = 0.9,
    ):
        self.provider = provider
        self.model = f"{provider}/{model}"
        self.api_base = api_base if provider == "ollama" else None
        self.max_tokens = max_tokens
        self.temperature = temperature

    def _build_extra_body(self) -> dict | None:
        """Configure provider-specific options."""
        if self.provider != "ollama":
            return None
        extra_body = {}
        if "gpt-oss" in self.model.lower():
            extra_body["think"] = "low"
        return extra_body if extra_body else None

    async def stream_completion(self, messages: list[dict]) -> AsyncGenerator[tuple[str, str], None]:
        """Stream typed chunks from LLM. Yields (chunk_type, content) tuples."""
        try:
            kwargs = {
                "model": self.model,
                "messages": messages,
                "max_tokens": self.max_tokens,
                "temperature": self.temperature,
                "stream": True,
            }
            if self.api_base:
                kwargs["api_base"] = self.api_base
            extra_body = self._build_extra_body()
            if extra_body:
                kwargs["extra_body"] = extra_body

            log.info(f"llm start model={self.model} max_tokens={self.max_tokens}")
            response = await litellm.acompletion(**kwargs)

            chunk_count = 0
            thinking_chunks = 0
            content_chunks = 0
            in_thinking = False
            buffer = ""

            async for chunk in response:
                chunk_count += 1
                content = self._extract_content(chunk)
                if content:
                    buffer += content

                    # Parse thinking tags
                    while buffer:
                        if in_thinking:
                            end_idx = buffer.find("</think>")
                            if end_idx != -1:
                                if end_idx > 0:
                                    thinking_chunks += 1
                                    yield ("thinking", buffer[:end_idx])
                                buffer = buffer[end_idx + 8:]
                                in_thinking = False
                            else:
                                # Partial thinking, yield and clear
                                thinking_chunks += 1
                                yield ("thinking", buffer)
                                buffer = ""
                                break
                        else:
                            start_idx = buffer.find("<think>")
                            if start_idx != -1:
                                if start_idx > 0:
                                    content_chunks += 1
                                    yield ("content", buffer[:start_idx])
                                buffer = buffer[start_idx + 7:]
                                in_thinking = True
                            else:
                                # Check for partial tag at end
                                if buffer.endswith("<") or any(buffer.endswith("<think>"[:i]) for i in range(1, 7)):
                                    break  # Wait for more data
                                content_chunks += 1
                                yield ("content", buffer)
                                buffer = ""
                                break

                # Check for finish reason
                if hasattr(chunk, "choices") and chunk.choices:
                    finish = chunk.choices[0].finish_reason
                    if finish:
                        log.info(f"llm finish reason={finish} chunks={chunk_count}")

            # Flush remaining buffer
            if buffer:
                if in_thinking:
                    thinking_chunks += 1
                else:
                    content_chunks += 1
                yield ("thinking" if in_thinking else "content", buffer)

            log.info(f"llm stream ended chunks={chunk_count} thinking={thinking_chunks} content={content_chunks}")
        except litellm.exceptions.ServiceUnavailableError:
            raise ConnectionError(f"{self.provider} unavailable")
        except Exception as e:
            log.exception(f"llm error: {e}")
            raise ConnectionError(f"LLM error: {e}")

    def _extract_content(self, chunk) -> str:
        """Extract text from various chunk formats."""
        try:
            if hasattr(chunk, "choices") and chunk.choices:
                delta = chunk.choices[0].delta
                if hasattr(delta, "content") and delta.content:
                    return delta.content
            return ""
        except (AttributeError, KeyError, IndexError):
            return ""
