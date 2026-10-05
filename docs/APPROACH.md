# Project Approach & Architecture — Build Secure 24

**Team ID:** TEAM-PS05-SHIPTRACK
**Project Name:** ShipTrack: Delivery & Shipment Management Platform
**Team Size:** 4 Members
**Primary Track / Domain:** Logistics & Secure Systems

---

## 1. Problem Understanding, Scope & Threat Model

### 1.1 Problem Statement & Real-World Motivation
Logistics management systems require real-time visibility, role-based access, and secure data handling across customers, delivery drivers, and system administrators. Key challenges include:
- Tamper-proof tracking updates and proof-of-delivery logging.
- Preventing unauthorized access to customer PII (addresses, phone numbers, recipient info).
- Ensuring drivers can only update assigned shipments.
- Providing automated AI-driven assistance for customer queries without exposing sensitive system internals.

### 1.2 Target Users & Personas
1. **Customer**: Creates shipments, views personal shipment history, tracks packages live via tracking numbers, generates shipping labels, and queries the AI assistant.
2. **Delivery Personnel (Driver)**: Accesses assigned delivery route dashboard, updates shipment statuses (Picked Up, In Transit, Out for Delivery, Delivered/Exception), logs checkpoints, and attaches delivery proof/notes.
3. **Administrator**: Manages global system state, assigns unallocated shipments to available drivers, manages user accounts (customers, drivers, admins), views fleet metrics, and monitors audit logs.

### 1.3 Threat Model & Attack Surface
- **Critical Assets:** User credentials (passwords, JWT secrets), Customer PII & addresses, Shipment audit history, Proof-of-delivery records.
- **Potential Attack Vectors:**
  - Unauthorized shipment tampering (IDOR - Insecure Direct Object References).
  - Privilege escalation (Customer trying to perform Driver/Admin actions).
  - SQL Injection / Data injection in search and tracking inputs.
  - Brute-force authentication attempts.
  - XSS via delivery notes or customer package descriptions.
- **OWASP Top 10 Security Controls:**
  - **A01:2021-Broken Access Control**: Enforced strict Role-Based Access Control (RBAC) middleware verifying token roles and ownership per endpoint.
  - **A02:2021-Cryptographic Failures**: Passwords hashed using `bcrypt` with salt rounds. Tokens signed with secure secret key.
  - **A03:2021-Injection**: Parameterized queries using SQLite prepared statements.
  - **A07:2021-Identification and Authentication Failures**: Rate limiting on `/api/auth/*` endpoints and strict token validation.

---

## 2. Technical Architecture & Secure System Design

### 2.1 High-Level Architecture Overview
```
┌──────────────────────────────────────────────────────────────────┐
│                      Client Layer (React SPA)                    │
│   [Customer Dashboard]   [Driver Dashboard]   [Admin Console]    │
│                        [AI ShipBot Assistant]                    │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ HTTP REST / SSE Stream
┌────────────────────────────────▼─────────────────────────────────┐
│                    API Gateway & Express Server                  │
│    Auth Middleware (JWT)  │  RBAC Guard  │ Rate Limiter / Helmet │
└────────┬───────────────────────┬──────────────────────┬──────────┘
         │                       │                      │
┌────────▼─────────┐    ┌────────▼─────────┐   ┌────────▼──────────┐
│ Authentication   │    │ Shipment Logic   │   │ AI Assistant      │
│ & User Service   │    │ & Status Engine  │   │ Context Engine    │
└────────┬─────────┘    └────────┬─────────┘   └────────┬──────────┘
         │                       │                      │
┌────────┴───────────────────────┴──────────────────────┴──────────┐
│                Database Layer (SQLite Data Store)                │
│       Users  │  Shipments  │  StatusLogs  │ Drivers │ Audit      │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow & Component Interaction
1. **Shipment Creation**: Customer posts payload -> Auth Middleware validates JWT -> Input Sanitizer checks fields -> Shipment record created with unique `TRK-YYYY-XXXXXX` tracking number -> Initial status log entry `CREATED` written -> Audit event logged.
2. **Assignment & Delivery Update**: Admin assigns driver -> Driver receives update on dashboard -> Driver posts status transition (e.g., `IN_TRANSIT` with location & notes) -> Middleware checks Driver assignment authorization -> Status updated & audit log saved.
3. **Tracking & AI Queries**: Customer queries tracking number -> Public API returns sanitized status timeline -> AI ShipBot analyzes tracking history and provides natural language status updates, delivery estimates, and advice.

### 2.3 Technology Stack Rationale
- **Backend / API Framework:** Node.js with Express.js — Fast, lightweight, asynchronous REST API performance with custom middleware support.
- **Frontend / Client:** React + Vite + TailwindCSS — Dynamic, responsive component-based UI with glassmorphism aesthetics and micro-animations.
- **Database & Persistence:** SQLite (via `better-sqlite3` / `sqlite3`) — Embedded relational DB with full ACID compliance and zero external service overhead.
- **Authentication & Cryptography:** `bcryptjs` for salted password hashing + JSON Web Tokens (`jsonwebtoken`) for stateless session authentication.
- **AI Assistant:** Contextual LLM / Intelligent Rule-Based Logistics NLP Engine reading live DB state safely.

### 2.4 Defense-in-Depth Security Controls
1. **Authentication & Session Security:** Salted password hashing, signed JWT tokens, auto-expiry, secure session storage.
2. **Authorization & Access Control:** Strict RBAC middleware (`requireRole('admin')`, `requireOwnerOrRole`).
3. **Input Validation & Sanitization:** Strict schema checks on all incoming POST/PUT payloads.
4. **Audit Trail:** Immutable timeline logging for all shipment status changes and administrative actions.

---

## 3. Implementation Milestones & 24-Hour Timeline

| Milestone / Phase | Time Window | Key Objectives & Deliverables | Security Verification | Status |
|---|---|---|---|---|
| **Phase 1: Foundation & Setup** | 0h – 4h | Contract onboarding, repo setup, baseline data schemas | Secret scan & baseline check | `Completed` |
| **Phase 2: Core Domain & Auth** | 4h – 12h | Core business logic, secure auth, shipment management | Auth test suite & crypto validation | `In Progress` |
| **Phase 3: Security & Hardening**| 12h – 18h | Input validation, RBAC middleware, error handling, audit log | SAST scanning & edge case tests | `Planned` |
| **Phase 4: Polish & Deployment**| 18h – 24h | UI polish, AI Assistant integration, live deployment | Live deployment URL check | `Planned` |

---

## 4. Architecture Decision Records (ADRs)

### ADR-001: Express REST API + React Vite Monorepo in `src/`
- **Status:** Accepted
- **Context:** Need unified development setup with single-command start for local testing and submission simplicity.
- **Options Considered:** 
  1. Separate Backend/Frontend repositories.
  2. Integrated Express backend serving built React SPA bundle from `src/`.
- **Decision & Rationale:** Option 2 chosen for seamless live build, simple deployment, and self-contained evaluation.

### ADR-002: Embedded SQLite Storage Engine
- **Status:** Accepted
- **Context:** Requires reliable, zero-config relational persistence supporting transactions.
- **Decision & Rationale:** SQLite provides full SQL queries, index speed, and portability without requiring external database server setup.

---

## 5. Engineering Journal & Real-Time Decision Log

### [2026-10-05 22:40 IST] Entry 1: Project Initialization & Scope Lock
- **Focus:** Onboarding compliance completed, architecture specification designed for PS-05 ShipTrack.
- **Key Challenges:** Establishing RBAC policies for Customer, Driver, and Admin roles.
- **Resolution:** Designed custom middleware enforcing role boundaries and ownership checks.

