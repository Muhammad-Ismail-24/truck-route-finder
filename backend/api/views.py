"""API views for Spotter Truck Routing.

Implements Sections 15.1, 15.2, 15.3 of ARCHITECTURE.md:
  - HealthView: GET /api/v1/health -> {"status": "ok", "version": "1.0.0"}
  - GeocodeSuggestView: GET /api/v1/geocode/suggest?q=... -> {"results": [...]} (throttled 60/min)
  - PlanView: POST /api/v1/plan -> full plan response matching Section 15.3 (throttled 60/min)
"""

import uuid
from typing import Any

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from api.serializers import GeocodeSuggestQuerySerializer, PlanRequestSerializer
from clients.here_geocoding import suggest
from planner import cache as planner_cache
from planner.cache import SUGGEST_CACHE_TTL_S, build_suggest_cache_key
from planner.presenters import present_plan
from planner.trip_planner import plan_trip

__all__ = ["GeocodeSuggestView", "HealthView", "PlanView", "health_check"]


class HealthView(APIView):
    """Health check endpoint (Section 15.1)."""

    permission_classes: list[Any] = []
    throttle_classes: list[Any] = []

    def get(self, request: Request) -> Response:
        """Return operational health status and service version."""
        return Response({"status": "ok", "version": "1.0.0"}, status=status.HTTP_200_OK)


# Retain function-based health_check for backward compatibility
health_check = HealthView.as_view()


class GeocodeSuggestView(APIView):
    """US address and place autocomplete endpoint (Section 15.2, D-22)."""

    permission_classes: list[Any] = []
    throttle_classes = [AnonRateThrottle]

    def get(self, request: Request) -> Response:
        """Fetch up to 5 US suggestions for search text with 24-hour caching."""
        serializer = GeocodeSuggestQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        q = serializer.validated_data["q"]

        cache_key = build_suggest_cache_key(q)
        cached = planner_cache.get(cache_key)
        if cached is not None:
            return Response({"results": cached}, status=status.HTTP_200_OK)

        places = suggest(query=q)
        results = [
            {
                "label": p.label,
                "lat": round(p.lat, 4),
                "lng": round(p.lng, 4),
            }
            for p in places
        ]

        planner_cache.set(cache_key, results, timeout=SUGGEST_CACHE_TTL_S)
        return Response({"results": results}, status=status.HTTP_200_OK)


class PlanView(APIView):
    """Trip planning endpoint (Section 15.3)."""

    permission_classes: list[Any] = []
    throttle_classes = [AnonRateThrottle]

    def post(self, request: Request) -> Response:
        """Validate input, plan routes, assess weather risk, rank routes, and return full plan."""
        request_id = str(uuid.uuid4())
        request.request_id = request_id  # type: ignore[attr-defined]

        serializer = PlanRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        plan_result = plan_trip(request=serializer.validated_data)
        presented = present_plan(plan_result)

        # Ensure request_id is assigned to response
        presented["request_id"] = request_id

        response = Response(presented, status=status.HTTP_200_OK)
        response["X-Request-ID"] = request_id
        return response
