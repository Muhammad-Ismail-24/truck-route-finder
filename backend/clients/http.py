"""Shared HTTP client factory and typed upstream error definitions.

Implements Section 11.1 of ARCHITECTURE.md:
  - Shared httpx.Client factory: timeout 10 s (connect 5 s).
  - 1 retry on timeout / 5xx / 429 with 300 ms backoff.
  - Custom User-Agent: spotter-truck-routing/1.0.
  - Typed errors: UpstreamError(service, status, detail), NoRouteFound.
"""

import time

import httpx

DEFAULT_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
DEFAULT_USER_AGENT = "spotter-truck-routing/1.0"
DEFAULT_BACKOFF_S = 0.3


class UpstreamError(Exception):
    """Raised when an external service returns an error or unparseable response."""

    def __init__(self, service: str, status: int, detail: str = "") -> None:
        self.service = service
        self.status = status
        self.detail = detail
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
    ) -> None:
        super().__init__(service="open_meteo", status=status, detail=detail)


class RetryTransport(httpx.BaseTransport):
    """Transport that retries requests once on timeout, 5xx, or 429 with backoff."""

    def __init__(
        self,
        transport: httpx.BaseTransport,
        backoff_s: float = DEFAULT_BACKOFF_S,
    ) -> None:
        self._transport = transport
        self._backoff_s = backoff_s

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        """Handle request with a single retry on transient failures."""
        try:
            response = self._transport.handle_request(request)
            if (response.status_code >= 500 or response.status_code == 429) and not getattr(
                request, "_retried", False
            ):
                request._retried = True  # type: ignore[attr-defined]
                if self._backoff_s > 0:
                    time.sleep(self._backoff_s)
                response.close()
                return self._transport.handle_request(request)
            return response
        except (httpx.TimeoutException, httpx.NetworkError):
            if not getattr(request, "_retried", False):
                request._retried = True  # type: ignore[attr-defined]
                if self._backoff_s > 0:
                    time.sleep(self._backoff_s)
                return self._transport.handle_request(request)
            raise

    def close(self) -> None:
        """Close the underlying transport."""
        self._transport.close()


def create_client(
    transport: httpx.BaseTransport | None = None,
    timeout: httpx.Timeout | None = None,
    user_agent: str = DEFAULT_USER_AGENT,
    backoff_s: float = DEFAULT_BACKOFF_S,
) -> httpx.Client:
    """Create a configured httpx.Client with standard timeouts, retry transport, and user agent."""
    base_transport = transport if transport is not None else httpx.HTTPTransport()
    retry_transport = RetryTransport(base_transport, backoff_s=backoff_s)
    return httpx.Client(
        transport=retry_transport,
        timeout=timeout or DEFAULT_TIMEOUT,
        headers={"User-Agent": user_agent},
    )
