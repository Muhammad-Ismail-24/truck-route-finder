"""HERE Geocoding & Search autosuggest client for US place suggestions.

Implements Section 11.3 and Decision D-22 of ARCHITECTURE.md:
  - suggest(query) -> list of Place(label, lat, lng), max 5, US only.
  - Uses HERE autosuggest endpoint with in=countryCode:USA and US centroid at=39.8283,-98.5795.
  - geocode_one is deliberately omitted (not needed; frontend picks from suggestions).
"""

import os
from typing import Any

import httpx

from clients.http import UpstreamError, create_client
from domain.models import Place

HERE_AUTOSUGGEST_URL: str = "https://autosuggest.search.hereapi.com/v1/autosuggest"
US_CENTROID_AT: str = "39.8283,-98.5795"
US_COUNTRY_FILTER: str = "countryCode:USA"
DEFAULT_LIMIT: int = 5


def _get_api_key(override_key: str | None = None) -> str:
    """Retrieve HERE API key from argument, Django settings, or environment variable."""
    if override_key:
        return override_key
    try:
        from django.conf import settings

        if settings.configured and hasattr(settings, "HERE_API_KEY") and settings.HERE_API_KEY:
            return str(settings.HERE_API_KEY)
    except ImportError:
        pass
    return os.environ.get("HERE_API_KEY", "")


def suggest(
    query: str,
    client: httpx.Client | None = None,
    api_key: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> list[Place]:
    """Fetch place suggestions for user input, restricted to USA (D-22, Section 11.3).

    Args:
        query: User search text (minimum 3 characters per Section 15.2).
        client: Optional shared httpx.Client (creates one if omitted).
        api_key: Optional HERE API key override (falls back to settings/env).
        limit: Maximum number of suggestions to return (default 5).

    Returns:
        List of Place objects containing formatted label, lat, and lng.

    Raises:
        UpstreamError: If the HERE autosuggest endpoint returns an HTTP error.
    """
    clean_query = query.strip()
    if not clean_query:
        return []

    key = _get_api_key(api_key)

    params: dict[str, str] = {
        "q": clean_query,
        "at": US_CENTROID_AT,
        "in": US_COUNTRY_FILTER,
        "limit": str(limit),
        "apiKey": key,
    }

    should_close = client is None
    http_client = client if client is not None else create_client()

    try:
        response = http_client.get(HERE_AUTOSUGGEST_URL, params=params)
    finally:
        if should_close:
            http_client.close()

    if response.status_code != 200:
        raise UpstreamError("here_geocoding", response.status_code, response.text)

    try:
        data = response.json()
    except Exception as exc:
        raise UpstreamError(
            "here_geocoding",
            response.status_code,
            f"Invalid JSON response: {exc}",
        ) from exc

    items: list[dict[str, Any]] = data.get("items", [])
    results: list[Place] = []

    for item in items:
        position = item.get("position")
        if not position or "lat" not in position or "lng" not in position:
            continue

        lat = float(position["lat"])
        lng = float(position["lng"])

        address = item.get("address", {})
        label = address.get("label") or item.get("title", "")

        results.append(Place(label=label, lat=lat, lng=lng))
        if len(results) >= limit:
            break

    return results
