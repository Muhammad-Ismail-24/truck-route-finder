"""API views for Spotter Truck Routing."""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.request import Request
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([])
def health_check(request: Request) -> Response:
    """Return service health status and API version."""
    return Response({"status": "ok", "version": "1.0.0"})
