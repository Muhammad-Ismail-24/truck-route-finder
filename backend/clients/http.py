"""Shared HTTP client factory and typed upstream error definitions.

Implements Section 11.1, Section 15.4, and Decision D-43 of ARCHITECTURE.md:
  - Shared httpx.Client factory: timeout 10 s (connect 5 s).
  - 1 retry on timeout / 5xx / 429:
    * on 429 honor Retry-After header capped at 5 s total.
    * otherwise jittered 400 to 800 ms backoff (backoff_s=0.0 in tests for speed).
  - Custom User-Agent: spotter-truck-routing/1.0.
  - Typed errors: UpstreamError, NoRouteFound, WeatherDataError.
"""

import random
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

DEFAULT_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
DEFAULT_USER_AGENT = "spotter-truck-routing/1.0"
DEFAULT_BACKOFF_S = 0.3

__all__ = [
    "DEFAULT_BACKOFF_S",
    "DEFAULT_TIMEOUT",
    "DEFAULT_USER_AGENT",
    "NoRouteFound",
    "RetryTransport",
    "UpstreamError",
    "WeatherDataError",
    "create_client",
    "parse_retry_after",
]


def parse_retry_after(response_or_headers: Any) -> int | None:
    """Parse Retry-After header as an integer number of seconds."""
    if response_or_headers is None:
        return None
    headers = getattr(response_or_headers, "headers", response_or_headers)
    if not hasattr(headers, "get"):
        return None
    raw = headers.get("Retry-After") or headers.get("retry-after")
    if not raw:
        return None
    raw_str = str(raw).strip()
    if raw_str.isdigit():
        return int(raw_str)
    try:
        dt = parsedate_to_datetime(raw_str)
        now = datetime.now(timezone.utc)
        diff = int((dt - now).total_seconds())
        return max(0, diff)
    except Exception:
        return None


class UpstreamError(Exception):
    """Raised when an external service returns an error or unparseable response."""

    def __init__(
        self,
        service: str,
        status: int,
        detail: str = "",
        retry_after_s: int | None = None,
    ) -> None:
        self.service = service
        self.status = status
        self.detail = detail
        self.retry_after_s = retry_after_s
        super().__init__(f"[{service}] upstream error {status}: {detail}")


class NoRouteFound(Exception):
    """Raised when the routing provider finds zero routes for the trip."""

    def __init__(self, message: str = "No truck route found between these points.") -> None:
        super().__init__(message)


class WeatherDataError(UpstreamError):
    """Raised when weather data cannot be fetched or contains null / invalid values (D-21)."""

    def __init__(
        self,
        detail: str = "Weather data unavailable or invalid.",
        status: int = 502,
        retry_after_s: int | None = None,
    ) -> None:
        super().__init__(
            service="open_meteo",
            status=status,
            detail=detail,
            retry_after_s=retry_after_s,
        )


class RetryTransport(httpx.BaseTransport):
    """Transport that retries requests once on timeout, 5xx, or 429 with backoff."""

    def __init__(
        self,
        transport: httpx.BaseTransport,
        backoff_s: float | None = None,
    ) -> None:
        self._transport = transport
        self._backoff_s = backoff_s

    def _get_retry_delay(self, response: httpx.Response | None = None) -> float:
        """Calculate retry delay honoring Retry-After (capped at 5s) or jittered 400-800ms."""
        if self._backoff_s is not None and self._backoff_s == 0.0:
            return 0.0
        if response is not None and response.status_code == 429:
            retry_after = parse_retry_after(response)
            if retry_after is not None:
                return min(5.0, max(0.0, float(retry_after)))
        if self._backoff_s is not None:
            return self._backoff_s
        return random.uniform(0.4, 0.8)

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        """Handle request with a single retry on transient failures."""
        try:
            response = self._transport.handle_request(request)
            if (response.status_code >= 500 or response.status_code == 429) and not getattr(
                request, "_retried", False
            ):
                request._retried = True  # type: ignore[attr-defined]
                delay = self._get_retry_delay(response)
                if delay > 0:
                    time.sleep(delay)
                response.close()
                return self._transport.handle_request(request)
            return response
        except (httpx.TimeoutException, httpx.NetworkError):
            if not getattr(request, "_retried", False):
                request._retried = True  # type: ignore[attr-defined]
                delay = self._get_retry_delay(None)
                if delay > 0:
                    time.sleep(delay)
                return self._transport.handle_request(request)
            raise

    def close(self) -> None:
        """Close the underlying transport."""
        self._transport.close()


def create_client(
    transport: httpx.BaseTransport | None = None,
    timeout: httpx.Timeout | None = None,
    user_agent: str = DEFAULT_USER_AGENT,
    backoff_s: float | None = None,
) -> httpx.Client:
    """Create a configured httpx.Client with standard timeouts, retry transport, and user agent."""
    base_transport = transport if transport is not None else httpx.HTTPTransport()
    retry_transport = RetryTransport(base_transport, backoff_s=backoff_s)
    return httpx.Client(
        transport=retry_transport,
        timeout=timeout or DEFAULT_TIMEOUT,
        headers={"User-Agent": user_agent},
    )
