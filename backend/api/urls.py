"""API URL routing for /api/v1."""

from django.urls import path

from api.views import GeocodeSuggestView, HealthView, PlanView

urlpatterns = [
    path("health", HealthView.as_view(), name="health"),
    path("geocode/suggest", GeocodeSuggestView.as_view(), name="geocode_suggest"),
    path("plan", PlanView.as_view(), name="plan"),
]
