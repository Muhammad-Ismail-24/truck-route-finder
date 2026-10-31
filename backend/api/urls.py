"""API URL routing."""

from django.urls import path

from api.views import health_check

urlpatterns = [
    path("health", health_check, name="health_check"),
]
