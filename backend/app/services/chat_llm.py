"""
NewsAura Chat LLM Service
-------------------------
Wraps Ollama or OpenRouter HTTP calls for chatbot responses ONLY.
Does NOT replace summarizer or sentiment_ml services.
"""

import logging
import httpx
import time
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def _safe_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _estimate_tokens(text: str) -> int:
    """Rough token estimate fallback when provider token counts are unavailable."""
    if not text:
        return 0
    return max(1, int(len(text.split()) * 1.3))


class ChatLLMService:
    """
    Service for generating chatbot responses using the configured provider.
    
    IMPORTANT: This service is ONLY for conversational chatbot responses.
    Summarization and sentiment analysis use separate services.
    """
    
    def __init__(self):
        self.provider = settings.LLM_PROVIDER
        if self.provider not in {"ollama", "openrouter"}:
            logger.warning("[CHAT_LLM] Unsupported LLM_PROVIDER=%r; using ollama", self.provider)
            self.provider = "ollama"

        if self.provider == "openrouter":
            self.base_url = settings.OPENROUTER_BASE_URL.rstrip("/")
            self.model = settings.OPENROUTER_MODEL
            self.timeout = settings.OPENROUTER_TIMEOUT
            self.api_key = settings.OPENROUTER_API_KEY
        else:
            self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")
            self.model = settings.OLLAMA_MODEL
            self.timeout = settings.OLLAMA_TIMEOUT
            self.api_key = ""

        self._available: Optional[bool] = None
        logger.info("[CHAT_LLM] Provider: %s | Model: %s", self.provider, self.model)
    
    async def is_available(self) -> bool:
        """Check whether the configured LLM provider is reachable."""
        if self.provider == "openrouter" and not self.api_key:
            logger.warning("[CHAT_LLM] OpenRouter API key is not configured")
            self._available = False
            return False

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                if self.provider == "ollama":
                    response = await client.get(f"{self.base_url}/api/tags")
                else:
                    response = await client.get(
                        f"{self.base_url}/models",
                        headers=self._openrouter_headers(),
                    )
                self._available = response.status_code == 200
                return self._available
        except Exception as e:
            logger.warning("[CHAT_LLM] %s not available: %s", self.provider, e)
            self._available = False
            return False

    def _openrouter_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _result(
        self,
        started: float,
        *,
        text: Optional[str] = None,
        success: bool = False,
        prompt_tokens: Optional[int] = None,
        completion_tokens: Optional[int] = None,
        total_tokens: Optional[int] = None,
        token_source: str = "none",
        error: Optional[str] = None,
    ) -> dict[str, Any]:
        if total_tokens is None and prompt_tokens is not None and completion_tokens is not None:
            total_tokens = prompt_tokens + completion_tokens
        return {
            "text": text,
            "success": success,
            "provider": self.provider,
            "model": self.model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "token_source": token_source,
            "latency_ms": (time.perf_counter() - started) * 1000,
            "error": error,
        }
    
    def _build_prompt(self, context: str, user_message: str, intent: str = "general") -> str:
        """
        Build a simple, direct prompt optimized for small LLM models.
        Uses different formats based on intent for better responses.
        """
        if intent == "article_qa":
            # Simple, direct format for article questions
            return f"""You are a helpful news assistant. Answer using the article context.

CONTEXT:
{context}

QUESTION:
{user_message}

Answer clearly using the article.
"""
        else:
            # General format for other intents
            return f"""You are a helpful news assistant. Use the provided context to respond clearly and concisely.

CONTEXT:
{context}

QUESTION:
{user_message}

Answer:
"""

    async def send_prompt_with_metrics(
        self,
        context: str,
        user_message: str,
        intent: str = "general"
    ) -> dict[str, Any]:
        """
        Send a prompt to the configured provider and return the response.
        
        Args:
            context: Aggregated context from user's data (bookmarks, read-later, analytics)
            user_message: The user's question/message
            intent: Detected intent (for logging)
        
        Returns:
            Structured result with text, token usage, latency, and error metadata.
        """
        # Log context details for debugging
        has_article_context = "=== CURRENT ARTICLE ===" in context
        has_news_feed_context = "=== CURRENT NEWS FEED ===" in context
        logger.info("[CHAT_LLM] Sending prompt: intent=%s has_article=%s has_feed=%s context_len=%d",
                   intent, has_article_context, has_news_feed_context, len(context))
        
        # Build intent-aware prompt (simplified for small models)
        prompt = self._build_prompt(context, user_message, intent)
        started = time.perf_counter()
        
        # Use separate connect (10s) and read (full timeout) limits
        timeout = httpx.Timeout(self.timeout, connect=10.0)
        
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                if self.provider == "ollama":
                    response = await client.post(
                        f"{self.base_url}/api/generate",
                        json={
                            "model": self.model,
                            "prompt": prompt,
                            "stream": False,
                            "options": {
                                "temperature": 0.7,
                                "top_p": 0.9,
                                "num_predict": 550,  # Allow longer responses
                                "num_ctx": 3072,     # More room for article context
                            }
                        },
                    )
                else:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._openrouter_headers(),
                        json={
                            "model": self.model,
                            "messages": [{"role": "user", "content": prompt}],
                            "temperature": 0.7,
                            "top_p": 0.9,
                            "max_tokens": 550,
                        },
                    )

                if response.status_code != 200:
                    logger.error("[CHAT_LLM] %s returned %d: %s",
                                 self.provider, response.status_code, response.text[:200])
                    return self._result(started, error=f"http_{response.status_code}")

                data = response.json()
                if self.provider == "ollama":
                    generated_text = data.get("response", "").strip()
                    prompt_tokens = _safe_int(data.get("prompt_eval_count"))
                    completion_tokens = _safe_int(data.get("eval_count"))
                    token_source = "actual"
                    if prompt_tokens is None:
                        prompt_tokens = _estimate_tokens(prompt)
                        token_source = "estimated"
                    if completion_tokens is None:
                        completion_tokens = _estimate_tokens(generated_text)
                        token_source = "estimated"
                else:
                    choices = data.get("choices") or []
                    message = choices[0].get("message", {}) if choices else {}
                    generated_text = str(message.get("content") or "").strip()
                    usage = data.get("usage") or {}
                    prompt_tokens = _safe_int(usage.get("prompt_tokens"))
                    completion_tokens = _safe_int(usage.get("completion_tokens"))
                    total_tokens = _safe_int(usage.get("total_tokens"))
                    token_source = "actual" if prompt_tokens is not None and completion_tokens is not None else "none"

                if not generated_text:
                    logger.warning("[CHAT_LLM] Empty response from %s", self.provider)
                    return self._result(started, error="empty_response")

                # Check if this looks like a fallback/refusal response
                is_fallback = "don't have enough information" in generated_text.lower()
                logger.info("[CHAT_LLM] Generated response: provider=%s model=%s intent=%s len=%d is_fallback=%s",
                           self.provider, self.model, intent, len(generated_text), is_fallback)
                return self._result(
                    started,
                    text=generated_text,
                    success=True,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens if self.provider == "openrouter" else None,
                    token_source=token_source,
                )
                
        except httpx.TimeoutException:
            logger.error("[CHAT_LLM] %s request timed out after %ds", self.provider, self.timeout)
            return self._result(started, error="timeout")
        except httpx.ConnectError:
            logger.error("[CHAT_LLM] Cannot connect to %s at %s", self.provider, self.base_url)
            return self._result(started, error="connect_error")
        except Exception as e:
            logger.error("[CHAT_LLM] Unexpected error: %s", e)
            return self._result(started, error="unexpected_error")

    async def send_prompt(
        self,
        context: str,
        user_message: str,
        intent: str = "general"
    ) -> Optional[str]:
        """Backward-compatible helper returning only generated text."""
        result = await self.send_prompt_with_metrics(context=context, user_message=user_message, intent=intent)
        return result.get("text")
    
    async def explain_like_five(self, article_title: str, article_content: str) -> Optional[str]:
        """
        Generate an ELI5 (Explain Like I'm 5) explanation of an article.
        """
        prompt = f"""You are NewsAura AI Assistant.

Explain the following news article in very simple terms that a 5-year-old could understand.
Use simple words, short sentences, and fun analogies.

ARTICLE TITLE: {article_title}

ARTICLE CONTENT:
{article_content[:1500]}

ELI5 EXPLANATION:"""
        
        return await self._generate_text(prompt, temperature=0.8, max_tokens=300, label="ELI5")
    
    async def explain_trend(self, trend_data: dict) -> Optional[str]:
        """
        Generate a natural language explanation of a trend in user's reading.
        """
        prompt = f"""You are NewsAura AI Assistant.

Based on the following analytics data, explain to the user what trends you notice in their reading habits.
Be insightful but concise.

ANALYTICS DATA:
{trend_data}

TREND EXPLANATION:"""
        
        return await self._generate_text(prompt, temperature=0.7, max_tokens=250, label="trend explanation")

    async def _generate_text(
        self,
        prompt: str,
        *,
        temperature: float,
        max_tokens: int,
        label: str,
    ) -> Optional[str]:
        """Generate text for legacy convenience helpers using the active provider."""
        timeout = httpx.Timeout(self.timeout, connect=10.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                if self.provider == "ollama":
                    response = await client.post(
                        f"{self.base_url}/api/generate",
                        json={
                            "model": self.model,
                            "prompt": prompt,
                            "stream": False,
                            "options": {"temperature": temperature, "num_predict": max_tokens},
                        },
                    )
                    if response.status_code == 200:
                        return response.json().get("response", "").strip() or None
                else:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._openrouter_headers(),
                        json={
                            "model": self.model,
                            "messages": [{"role": "user", "content": prompt}],
                            "temperature": temperature,
                            "max_tokens": max_tokens,
                        },
                    )
                    if response.status_code == 200:
                        choices = response.json().get("choices") or []
                        message = choices[0].get("message", {}) if choices else {}
                        return str(message.get("content") or "").strip() or None

                logger.error("[CHAT_LLM] %s %s request failed: http_%d", self.provider, label, response.status_code)
                return None
        except Exception as e:
            logger.error("[CHAT_LLM] %s %s error: %s", self.provider, label, e)
            return None


# Singleton instance
chat_llm = ChatLLMService()


# Convenience function for fallback message
FALLBACK_MESSAGE = "AI assistant is temporarily unavailable. Please try again in a moment."


def get_fallback_message() -> str:
    """Return the standard fallback message when LLM is unavailable."""
    return FALLBACK_MESSAGE
