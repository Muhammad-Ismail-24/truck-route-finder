"""Django settings for Spotter Truck Routing backend."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Read .env if present in backend directory
env_path = BASE_DIR / ".env"
if env_path.is_file():
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            clean_line = line.strip()
            if clean_line and not clean_line.startswith("#") and "=" in clean_line:
                key, val = clean_line.split("=", 1)
                os.environ[key.strip()] = val.strip()

HERE_API_KEY = os.getenv("HERE_API_KEY", "")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "change-me-dev-secret-key")

DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() in ("true", "1", "yes")

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv(
        "DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,.vercel.app,testserver"
    ).split(",")
    if host.strip()
]
if "testserver" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append("testserver")


INSTALLED_APPS = [
    "corsheaders",
    "rest_framework",
    "api",
]

MIDDLEWARE = [
    "django.middleware.gzip.GZipMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = []

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {}

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

CACHE_BACKEND = os.getenv("CACHE_BACKEND", "locmem").lower()
REDIS_URL = os.getenv("REDIS_URL", "")

if CACHE_BACKEND == "redis" and REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "spotter-weather-cache",
        }
    }

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/min",
    },
    "EXCEPTION_HANDLER": "api.errors.custom_exception_handler",
}

TIME_ZONE = "UTC"
USE_TZ = True
