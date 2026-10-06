# Deployment Documentation — Build Secure 24

## Overview

This directory contains deployment configuration, Vercel serverless instructions, and deployment records for **ShipTrack — Delivery & Shipment Management Platform**.

---

## Live Deployment Reference

- **Live Application URL:** `https://project-shipment-e2pt.vercel.app/`
- **Hosting Platform:** Vercel (Serverless Functions & Static Edge Delivery)
- **Access Credentials for Evaluators:**
  - **Customer Role:** `customer@shiptrack.com` / `password123`
  - **Driver Role:** `driver@shiptrack.com` / `password123`
  - **Admin Role:** `admin@shiptrack.com` / `password123`

---

## Required Environment Variables

| Variable Name | Description | Required (Yes/No) | Default Value |
|---------------|-------------|-------------------|---------------|
| `PORT` | Local backend HTTP server port | No | `5000` |
| `JWT_SECRET` | Secret key for signing JWT authentication tokens | No | `shiptrack-buildsecure24-super-secret-key-998811` |
| `VERCEL` | Environment flag automatically set by Vercel | Automatic | `1` (on Vercel) |

---

## Build & Deployment Architecture

1. **Vercel Serverless Routing (`vercel.json`)**:
   - `vercel.json` maps incoming requests to `@vercel/node` handler (`src/server.js`).
   - The Express application handles both API routes (`/api/*`) and static SPA frontend rendering (`index.html`).

2. **SQLite Persistence on Vercel**:
   - On Vercel serverless execution environments, the pre-seeded SQLite database `shiptrack.db` is initialized and copied to `/tmp/shiptrack.db` if writable storage is required.

3. **Deploying Updates to Vercel**:
   ```bash
   git add -A
   git commit -m "Fix deployment routing and vercel configuration"
   git push origin main
   ```
   Vercel automatically triggers a build and deploys the latest commit to `https://project-shipment-e2pt.vercel.app/`.
