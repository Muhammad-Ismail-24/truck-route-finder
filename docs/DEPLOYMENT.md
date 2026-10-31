# Deployment Guide

This guide details the deployment procedure for **HAULCAST / Spotter Truck Routing** across Vercel (primary setup) and Render (backend fallback option), per `ARCHITECTURE.md` Section 23 and Decision `D-15`.

---

## 1. Architecture & Hosting Strategy

The repository is structured as a monorepo containing two decoupled applications:
* `backend/`: Django 5 REST API using Python 3.12, providing routing via HERE Routing API v8, Open-Meteo weather enrichment, severe weather risk classification, and spatio-temporal heatmap slices.
* `frontend/`: Next.js 14+ App Router application featuring the scroll-scrubbed hero narrative, MapLibre GL JS vector map, and real-time interactive route planner.

### Vercel Multi-Project Setup (Primary)
The recommended architecture hosts both applications on **Vercel** as two separate projects connected to the same GitHub repository:
1. **Backend Project**: Deployed from the `backend/` directory using Vercel's native Python runtime and serverless functions (`config/wsgi.py`).
2. **Frontend Project**: Deployed from the `frontend/` directory using Vercel's native Next.js framework preset. Next.js server rewrites proxy all `/api/*` traffic directly to the backend URL, eliminating browser CORS complications.

---

## 2. Prerequisites

Before beginning deployment, ensure you have:
1. A GitHub repository containing the complete codebase pushed to `main`.
2. A [Vercel account](https://vercel.com).
3. A [HERE Platform API Key](https://developer.here.com/) with access to the Routing API v8 and Geocoding & Search API v7.
4. (Optional) A [Render account](https://render.com) if using the Render backend fallback.

---

## 3. Project 1: Backend Deployment (Vercel)

### Step 3.1: Import the Repository
1. Navigate to the **[Vercel Dashboard](https://vercel.com/dashboard)**.
2. Click **"Add New..."** → **"Project"**.
3. Locate your GitHub repository and click **"Import"**.

### Step 3.2: Configure Project Settings
* **Project Name**: `spotter-truck-backend` (or your preferred name)
* **Framework Preset**: **Django** (auto-detected from `manage.py`)
* **Root Directory**: Click **"Edit"**, select or type **`backend`**, and click **"Save"**.
* **Build and Output Settings**: Leave defaults intact (Vercel uses `uv` and `@vercel/python` automatically).

### Step 3.3: Configure Environment Variables
Expand the **"Environment Variables"** accordion and add the following keys (from `ARCHITECTURE.md` Section 16.2):

| Variable Name | Recommended Value / Notes | Required? |
| :--- | :--- | :--- |
| `DJANGO_SECRET_KEY` | Generate a 50-character random string (e.g. `openssl rand -hex 32`) | **Yes** |
| `DJANGO_DEBUG` | `false` | **Yes** |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1,.vercel.app` | **Yes** |
| `HERE_API_KEY` | Your HERE Developer Platform API key | **Yes** |
| `CACHE_BACKEND` | `locmem` (or `redis` if you provision a cloud Redis instance) | **Yes** |
| `DELAY_BUFFER` | `1.10` (standard 10% truck buffer) | **Yes** |
| `TRUCK_TARE_LB` | `32000` (tare weight for gross weight calculation) | **Yes** |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` (can add frontend URL once known) | Optional |

### Step 3.4: Deploy and Note URL
1. Click **"Deploy"**.
2. Wait for the build and deployment to complete (~1 to 2 minutes).
3. Copy the production deployment URL (e.g., `https://spotter-truck-backend.vercel.app`).
4. **Smoke test the backend directly**:
   Open `https://<backend-project>.vercel.app/api/v1/health` in your browser.
   Expected response:
   ```json
   {
     "status": "healthy",
     "service": "spotter-truck-routing",
     "version": "1.0.0",
     "checks": {
       "here_api": "configured",
       "open_meteo": "available",
       "cache": "operational"
     }
   }
   ```

---

## 4. Project 2: Frontend Deployment (Vercel)

### Step 4.1: Import the Repository
1. Return to the **[Vercel Dashboard](https://vercel.com/dashboard)**.
2. Click **"Add New..."** → **"Project"**.
3. Select the **same** GitHub repository and click **"Import"**.

### Step 4.2: Configure Project Settings
* **Project Name**: `spotter-truck-frontend` (or `haulcast`)
* **Framework Preset**: **Next.js** (auto-detected)
* **Root Directory**: Click **"Edit"**, select or type **`frontend`**, and click **"Save"**.
* **Build Command**: `npm run build` (default)
* **Output Directory**: `.next` (default)

### Step 4.3: Configure Environment Variables
Expand **"Environment Variables"** and configure:

| Variable Name | Recommended Value | Description |
| :--- | :--- | :--- |
| `BACKEND_URL` | `https://<backend-project>.vercel.app` | **Target backend URL** (no trailing slash). Used by Next.js server rewrites in `next.config.mjs` to proxy `/api/*`. |
| `NEXT_PUBLIC_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/positron` | Default OpenFreeMap Positron vector map style URL. |

> [!NOTE]
> Do NOT set `NEXT_PUBLIC_API_BASE_URL` unless you intentionally want the browser to bypass Next.js rewrites and issue direct cross-origin requests to the backend. Leaving it unset ensures clean same-origin calls through `/api/*`.

### Step 4.4: Deploy and Note URL
1. Click **"Deploy"**.
2. Wait for the Next.js production build to complete (~1 minute).
3. Copy the production frontend URL (e.g., `https://spotter-truck-frontend.vercel.app`).

---

## 5. End-to-End Smoke Testing & Verification

Once both projects are deployed:

### 1. Proxied Health Check
Verify that Next.js successfully rewrites API requests to the backend:
```bash
curl -i https://<frontend-project>.vercel.app/api/v1/health
```
Verify it returns `200 OK` with JSON payload `{"status": "healthy", ...}`.

### 2. Scroll Hero & Media Check
Open `https://<frontend-project>.vercel.app` in your browser:
* Verify the landing hero renders cleanly with crisp typography.
* Verify the CloudFront video streams (`https://d2a91hipt5dykr.cloudfront.net/...`) load smoothly.
* Scroll through the hero track: verify the sticky scene transitions smoothly at 60 fps.
* Verify the scrubber navigation pill smoothly transitions you to `#planner`.

### 3. Route Planning & Heatmap Check
In the `#planner` section:
1. Enter Origin: **Chicago, IL** (select from autocomplete dropdown).
2. Enter Destination: **Denver, CO** (select from autocomplete dropdown).
3. Set Departure Time: Next full hour.
4. Set Load Weight: **45,000 lb**.
5. Set Checkpoint Interval: **25 miles**.
6. Click **"Calculate Safe Routes"**.
7. **Verify Results**:
   * Up to 3 alternative truck routes appear on the map and sidebar.
   * Checkpoints appear along the route with risk badges and weather parameters.
   * Recommended route banner explains the selection based on lexicographic safety criteria.
   * Drag the 0–48 hour heatmap slider: verify that the heatmap surface updates responsively.

---

## 6. Fallback Option: Backend on Render (Decision D-15)

If Vercel's serverless function timeout limits (or cold starts on complex multi-route weather fetching) cause issues, deploy the backend to **Render** as a dedicated web service.

### Step-by-Step Render Deployment:
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **"New +"** → **"Web Service"**.
3. Connect your GitHub repository.
4. Set configuration parameters:
   * **Name**: `spotter-truck-backend`
   * **Region**: Oregon (US West) or Ohio (US East)
   * **Branch**: `main`
   * **Root Directory**: `backend`
   * **Runtime**: `Python 3`
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --timeout 60 --workers 2`
5. Under **Environment Variables**, add:
   * `DJANGO_SECRET_KEY`: `<generated-key>`
   * `DJANGO_DEBUG`: `false`
   * `DJANGO_ALLOWED_HOSTS`: `localhost,127.0.0.1,.onrender.com,.vercel.app`
   * `HERE_API_KEY`: `<your-here-api-key>`
   * `CACHE_BACKEND`: `locmem`
   * `DELAY_BUFFER`: `1.10`
   * `TRUCK_TARE_LB`: `32000`
   * `CORS_ALLOWED_ORIGINS`: `https://<frontend-project>.vercel.app`
6. Click **"Create Web Service"**.
7. Once deployed, copy the Render URL (e.g. `https://spotter-truck-backend.onrender.com`).
8. Update the Frontend project on Vercel:
   * Go to **Vercel Dashboard** → `spotter-truck-frontend` → **Settings** → **Environment Variables**.
   * Update `BACKEND_URL` to `https://spotter-truck-backend.onrender.com`.
   * Redeploy the frontend project (**Deployments** → **...** → **Redeploy**).
9. Record the decision in `docs/DECISIONS.md`.
