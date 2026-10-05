# ShipTrack — Delivery & Shipment Management Platform

**Build Secure 24 Hackathon Project**  
**Problem Statement:** PS-05 — ShipTrack: Delivery & Shipment Management  
**Team Name:** Project-shipment  
**Repository:** https://github.com/Akhil-Kushuma/Project-shipment.git

---

## 👥 Team Members

- **AKHIL** (`25P61A6259@vbithyd.ac.in`)
- **Devamsh** (`25P61A6247@vbithyd.ac.in`)
- **Rithvik** (`25P61A6261@vbithyd.ac.in`)
- **Nithin** (`25P61A6234@vbithyd.ac.in`)

---

## 🚀 What We Built

We built a full-stack secure shipment management platform (**ShipTrack**) featuring multi-role authentication, live tracking, driver management, administrative controls, support ticketing, and an AI logistics assistant.

### Key Features Implemented:

1. **Authentication & Role-Based Access Control (RBAC)**
   - Secure customer, driver, and admin registration and login using JWT and Bcrypt hashing.
   - Role-guarded API endpoints and dynamic navigation header.
   - One-click demo login presets.

2. **Live Tracking & Route Visualizer**
   - Public live tracking search by tracking ID (e.g. `TRK-2026-894120`).
   - 5-step progress timeline (*Created* ➔ *Picked Up* ➔ *In Transit* ➔ *Out for Delivery* ➔ *Delivered*).
   - Interactive simulated GPS route map visualizer.
   - Fallback offline shipment store to ensure zero search downtime.

3. **Customer Hub**
   - Create new shipments with origin, destination, package details, and priority.
   - View customer shipment history and download printable shipping labels.

4. **Driver Delivery Console**
   - View assigned delivery routes and package manifest.
   - Update shipment statuses and log location checkpoint notes.

5. **Help & Support Center**
   - Public support center with issue category cards (*Late Delivery, Refund & Payment, Cancellation, Damaged Package, Missing Item, Tracking Problem*).
   - Support ticket submission with live tracking ID validation.

6. **Admin Management Panel**
   - Fleet overview metrics (active shipments, drivers, pending dispatches, revenue in ₹ INR).
   - Driver package assignment module.
   - Full system audit log tracking all status changes.
   - Customer support ticket resolution portal.

7. **AI ShipBot Assistant**
   - Contextual chatbot assistant that answers shipment status, estimate, and policy questions directly from application data.

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, Vanilla JavaScript, Tailwind CSS (Single Page Application architecture).
- **Backend:** Node.js, Express.js REST API (`src/server.js`).
- **Database:** SQLite (`src/db/shiptrack.db`) using relational tables (`users`, `shipments`, `shipment_logs`, `drivers`, `support_tickets`).
- **Security:** JWT authentication, `bcryptjs` password hashing, RBAC middleware (`src/middleware/auth.js`), prepared SQL statements.

---

## 🔑 Demo Accounts

| Role | Email | Password |
|---|---|---|
| **Customer** | `customer@shiptrack.com` | `password123` |
| **Driver** | `driver@shiptrack.com` | `password123` |
| **Admin** | `admin@shiptrack.com` | `password123` |

**Demo Tracking Numbers:** `TRK-2026-894120`, `TRK-2026-302194`, `TRK-2026-110482`

---

## 🏃 How to Run the Project

1. Navigate to the source directory:
   ```bash
   cd src
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

4. Open browser at:
   ```
   http://localhost:5000
   ```
