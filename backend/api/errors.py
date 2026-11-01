"""Custom exception handling and standardized error responses for the API.

Implements Section 15.4 of ARCHITECTURE.md:
  - Error envelope: {"error": {"code": ..., "message": ..., "details": ...}}
  - Codes & HTTP statuses:
      VALIDATION_ERROR (400)
      NO_ROUTE_FOUND (422)
      UPSTREAM_ROUTING_ERROR (502)
      UPSTREAM_WEATHER_ERROR (502)
      RATE_LIMITED (429)
      INTERNAL_ERROR (500)
  - Logs internal errors with request_id; never leaks stack traces.
"""

import logging
import uuid
from typing import Any

from rest_framework import exceptions, status
from rest_framework.response import Response

from clients.http import NoRouteFound, UpstreamError, WeatherDataError

logger = logging.getLogger("api.errors")

__all__ = ["custom_exception_handler"]


def _extract_request_id(request: Any) -> str:
    """Extract or generate request_id from request."""
    if request is not None:
        req_id = getattr(request, "request_id", None)
        if req_id:
            return str(req_id)
        header_val = request.META.get("HTTP_X_REQUEST_ID") if hasattr(request, "META") else None
        if header_val:
            return str(header_val)
    return str(uuid.uuid4())


def custom_exception_handler(exc: Exception, context: dict[str, Any]) -> Response:
    """DRF custom exception handler returning standardized error schema (Section 15.4)."""
    request = context.get("request")
    request_id = _extract_request_id(request)

    code = "INTERNAL_ERROR"
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    message = "An unexpected error occurred."
    details: dict[str, Any] = {}

    # 1. Validation Errors (400)
    if isinstance(exc, exceptions.ValidationError):
        code = "VALIDATION_ERROR"
        status_code = status.HTTP_400_BAD_REQUEST
        message = "Invalid request parameters."
        details = exc.detail if isinstance(exc.detail, dict) else {"error": exc.detail}

    # 2. No Route Found (422)
    elif isinstance(exc, NoRouteFound):
        code = "NO_ROUTE_FOUND"
        status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
        message = str(exc) if str(exc) else "No truck route found between these points."
        details = {}

    # 3. Weather Upstream Errors (502 / 429)
    elif isinstance(exc, WeatherDataError):
        upstream_status = getattr(exc, "status", 502)
        if upstream_status == status.HTTP_429_TOO_MANY_REQUESTS:
            code = "RATE_LIMITED"
            status_code = status.HTTP_429_TOO_MANY_REQUESTS
            message = "The weather service is busy. Please try again in a minute."
            details = {}
            if getattr(exc, "retry_after_s", None) is not None:
                details["retry_after_s"] = exc.retry_after_s
        else:
            code = "UPSTREAM_WEATHER_ERROR"
            status_code = status.HTTP_502_BAD_GATEWAY
            message = (
                exc.detail
                if hasattr(exc, "detail") and exc.detail
                else "Weather service unavailable."
            )
            details = {}

    # 4. Other Upstream Service Errors (502 / 429)
    elif isinstance(exc, UpstreamError):
        service = getattr(exc, "service", "unknown")
        upstream_status = getattr(exc, "status", 502)
        exc_detail = getattr(exc, "detail", "")
        details = {}

        if upstream_status == status.HTTP_429_TOO_MANY_REQUESTS:
            code = "RATE_LIMITED"
            status_code = status.HTTP_429_TOO_MANY_REQUESTS
            if "weather" in service or "meteo" in service:
                message = "The weather service is busy. Please try again in a minute."
            else:
                message = "Upstream rate limit exceeded."
            if getattr(exc, "retry_after_s", None) is not None:
                details["retry_after_s"] = exc.retry_after_s
        elif "routing" in service or "geocoding" in service:
            code = "UPSTREAM_ROUTING_ERROR"
            status_code = status.HTTP_502_BAD_GATEWAY
            message = exc_detail if exc_detail else "Routing service unavailable."
        elif "weather" in service or "meteo" in service:
            code = "UPSTREAM_WEATHER_ERROR"
            status_code = status.HTTP_502_BAD_GATEWAY
            message = exc_detail if exc_detail else "Weather service unavailable."
        else:
            code = "UPSTREAM_ROUTING_ERROR"
            status_code = status.HTTP_502_BAD_GATEWAY
            message = exc_detail if exc_detail else "Upstream service error."

    # 5. Throttling (429)
    elif isinstance(exc, exceptions.Throttled):
        code = "RATE_LIMITED"
        status_code = status.HTTP_429_TOO_MANY_REQUESTS
        wait = exc.wait
        message = (
            f"Request was throttled. Expected available in {int(wait)} seconds."
            if wait is not None
            else "Request rate limit exceeded."
        )
        details = {"wait_seconds": wait} if wait is not None else {}

    # 6. Other DRF API Exceptions
    elif isinstance(exc, exceptions.APIException):
        status_code = exc.status_code
        if status_code == status.HTTP_400_BAD_REQUEST:
            code = "VALIDATION_ERROR"
        elif status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            code = "RATE_LIMITED"
        else:
            code = "INTERNAL_ERROR"
        message = str(exc.detail) if hasattr(exc, "detail") else str(exc)
        details = {}

    # 7. Unhandled exceptions (500) - Never leak stack traces!
    else:
        logger.exception("Internal error processing request %s: %s", request_id, exc)
        code = "INTERNAL_ERROR"
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        message = "An unexpected error occurred. Please try again later."
        details = {}

    payload = {
        "error": {
            "code": code,
            "message": message,
            "details": details,
        }
    }

    response = Response(payload, status=status_code)
    response["X-Request-ID"] = request_id
    if "retry_after_s" in details and details["retry_after_s"] is not None:
        response["Retry-After"] = str(details["retry_after_s"])
    return response
