# IT Ticket Auto-Routing & SLA Management Platform

> An intelligent service desk platform that automatically classifies, routes, prioritizes, and monitors IT support tickets using a Spring Boot backend, PostgreSQL, and a dedicated FastAPI machine-learning service.

![Java](https://img.shields.io/badge/Java-17%2B-orange)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.x-brightgreen)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.9x-009688)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-336791)
![ML](https://img.shields.io/badge/ML-TF--IDF%20%2B%20Linear%20SVM-purple)
![Testing](https://img.shields.io/badge/Testing-JUnit%20%7C%20Pytest-success)

---

## Overview

Traditional IT help-desk systems often rely heavily on manual ticket classification and assignment. This creates delays, inconsistent routing, and a higher risk of SLA breaches.

This project automates the initial stages of the support workflow.

When an employee creates a ticket, the platform:

1. Authenticates the request using JWT.
2. Sends the ticket content to a dedicated ML classification service.
3. Predicts the ticket category using **TF-IDF + calibrated Linear SVM**.
4. Evaluates prediction confidence.
5. Automatically routes high-confidence tickets to the appropriate support team.
6. Sends low-confidence predictions to a **manual review queue**.
7. Determines ticket priority from its content.
8. Calculates the corresponding SLA deadline.
9. Continuously monitors unresolved tickets for SLA risk and breaches.
10. Enforces a controlled ticket lifecycle until resolution and closure.

The **Spring Boot application remains the system of record**, while the Python service is responsible only for ML inference.

---

## Key Engineering Features

### Intelligent Classification

* TF-IDF text vectorization
* Calibrated Linear SVM classifier
* Confidence-aware predictions
* Configurable confidence threshold
* Manual-review fallback when confidence is insufficient
* Graceful degradation when the ML service is unavailable

### Automated Routing

Ticket categories are deterministically mapped to support teams.

| Category              | Support Team             |
| --------------------- | ------------------------ |
| Hardware              | Hardware Support         |
| Access                | IT Access                |
| HR Support            | HR Helpdesk              |
| Purchase              | Procurement              |
| Storage               | Storage / Infrastructure |
| Internal Project      | Internal Projects        |
| Administrative Rights | Administrative Support   |
| Miscellaneous         | General Support          |

Keeping routing deterministic makes the assignment logic predictable, auditable, and easy to modify independently of the ML model.

### SLA Management

Priority determines the initial SLA target.

| Priority |   SLA Target |
| -------- | -----------: |
| Critical |  120 minutes |
| High     |  240 minutes |
| Medium   |  480 minutes |
| Low      | 1440 minutes |

The SLA monitor evaluates unresolved tickets periodically:

```text
                    SLA Monitoring
                          |
             +------------+------------+
             |                         |
       Deadline passed?          Time remaining?
             |                         |
            YES                  <= 20% remaining
             |                         |
         BREACHED                AT_RISK
             |
             NO
             |
         ON_TRACK
```

Resolved and closed tickets are excluded from active SLA escalation.

---

# Architecture

```text
                         ┌─────────────────────┐
                         │    Browser Client   │
                         │  HTML / CSS / JS    │
                         └──────────┬──────────┘
                                    │
                                    │ REST / JWT
                                    ▼
                    ┌─────────────────────────────┐
                    │       Spring Boot API       │
                    │                             │
                    │ Authentication & RBAC       │
                    │ Ticket Management            │
                    │ Routing                      │
                    │ Priority & SLA Logic         │
                    │ Workflow Enforcement         │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
          ┌──────────────────┐          ┌──────────────────┐
          │   PostgreSQL     │          │ FastAPI ML       │
          │                  │          │ Classification   │
          │ Users            │          │                  │
          │ Tickets          │          │ TF-IDF           │
          │ Teams            │          │ Calibrated SVM   │
          │ SLA information  │          │                  │
          └──────────────────┘          └──────────────────┘
```

### Request Flow

```text
Create Ticket
     │
     ▼
Spring Boot API
     │
     ├── Validate request
     ├── Authenticate user
     │
     ▼
FastAPI Classification Service
     │
     ▼
TF-IDF + Calibrated Linear SVM
     │
     ▼
Prediction + Confidence
     │
     ├─────────────── Confidence >= 0.80
     │                         │
     │                         ▼
     │                  Automatic Classification
     │                         │
     │                         ▼
     │                  Category → Team
     │
     └─────────────── Confidence < 0.80
                               │
                               ▼
                         Manual Review Queue
                               │
                               ▼
                         Agent / Admin Review

                    Both paths continue to:
                               │
                               ▼
                         Priority Calculation
                               │
                               ▼
                         SLA Deadline
                               │
                               ▼
                       PostgreSQL Persistence
```

---

# Why a Separate ML Service?

The classification model is isolated from the main Java application instead of embedding Python ML execution directly inside Spring Boot.

This provides a clear separation of responsibilities:

| Component      | Responsibility                                                       |
| -------------- | -------------------------------------------------------------------- |
| Spring Boot    | Business logic, authentication, authorization, persistence, workflow |
| FastAPI        | ML inference                                                         |
| PostgreSQL     | Persistent application state                                         |
| Browser Client | User interaction                                                     |

This separation also allows the classifier to be independently retrained, evaluated, deployed, or replaced without changing the core ticket-management logic.

---

# Classification Pipeline

The classifier uses a traditional supervised NLP pipeline:

```text
Ticket Subject
      +
Ticket Description
      │
      ▼
Text Preprocessing
      │
      ▼
TF-IDF Vectorization
      │
      ▼
Calibrated Linear SVM
      │
      ▼
Category + Confidence
```

### Why TF-IDF + Linear SVM?

The ticket-classification problem is primarily based on textual patterns and domain-specific keywords.

TF-IDF provides a compact representation of important terms, while Linear SVM is well suited to high-dimensional sparse text features.

The calibrated classifier additionally provides confidence estimates that can be used by the application to distinguish between:

```text
High-confidence prediction
        ↓
Automatic routing

Low-confidence prediction
        ↓
Human review
```

This prevents uncertain predictions from being silently routed to the wrong support team.

---

# Fail-Safe ML Integration

The ML service is **not a hard dependency for ticket creation**.

If:

* the classifier is unavailable,
* the model artifact is missing,
* the request times out, or
* the prediction confidence is below the configured threshold,

the Spring Boot application keeps the ticket and sends it through the manual-review workflow.

```text
                 Ticket Creation
                       │
                       ▼
                ML Classification
                       │
             ┌─────────┴─────────┐
             │                   │
          Success             Failure
             │                   │
             ▼                   ▼
       Confidence Check      Manual Review
             │
       ┌─────┴─────┐
       │           │
      >= 0.80     < 0.80
       │           │
       ▼           ▼
    Auto-route   Manual Review
```

This design prioritizes **availability and recoverability** over forcing every ticket through an unavailable or uncertain ML component.

---

# Ticket Lifecycle

Tickets follow a controlled state machine:

```text
OPEN
  │
  ▼
IN_PROGRESS
  │
  ▼
RESOLVED
  │
  ▼
CLOSED
```

Invalid transitions are rejected by the API.

For example:

```text
OPEN → RESOLVED      ✗
CLOSED → OPEN        ✗
RESOLVED → OPEN      ✗
```

This prevents inconsistent ticket states and keeps the workflow predictable.

---

# Role-Based Access Control

The platform implements JWT authentication and role-based authorization.

| Role          | Capabilities                                                           |
| ------------- | ---------------------------------------------------------------------- |
| Employee      | Create tickets, view owned tickets, close resolved tickets             |
| Agent         | View assigned tickets, update assigned tickets, review classifications |
| Administrator | View all tickets, manage assignments/status, review classifications    |

Authentication flow:

```text
Login
  │
  ▼
Credentials validated
  │
  ▼
BCrypt password verification
  │
  ▼
JWT generated
  │
  ▼
Client sends:
Authorization: Bearer <JWT>
  │
  ▼
Spring Security
  │
  ▼
Role-based authorization
```

---

# Priority & SLA Engine

Priority is determined from ticket content and is used to establish the initial SLA deadline.

```text
Ticket Content
      │
      ▼
Priority Calculation
      │
 ┌────┼────┬────┐
 ▼    ▼    ▼    ▼
Low Medium High Critical
 │     │     │      │
 ▼     ▼     ▼      ▼
24h    8h    4h     2h
```

The SLA monitor periodically evaluates active tickets.

### SLA States

| State      | Meaning                                |
| ---------- | -------------------------------------- |
| `ON_TRACK` | Sufficient SLA time remains            |
| `AT_RISK`  | 20% or less of the target time remains |
| `BREACHED` | SLA deadline has passed                |
| `RESOLVED` | Ticket has been resolved/closed        |

---

# Technology Stack

| Layer               | Technology                   |
| ------------------- | ---------------------------- |
| Frontend            | HTML, CSS, JavaScript        |
| Backend             | Java 17, Spring Boot         |
| Security            | Spring Security, JWT, BCrypt |
| Persistence         | Spring Data JPA, Hibernate   |
| Database            | PostgreSQL                   |
| ML Service          | Python, FastAPI              |
| Machine Learning    | scikit-learn                 |
| NLP                 | TF-IDF                       |
| Classifier          | Calibrated Linear SVM        |
| Model Serialization | joblib                       |
| Backend Build       | Maven                        |
| ML Testing          | Pytest                       |

---

# Repository Structure

```text
.
├── backend/
│   ├── src/
│   │   ├── main/
│   │   │   └── java/
│   │   └── test/
│   └── pom.xml
│
├── frontend/
│   ├── index.html
│   ├── css/
│   └── js/
│
├── ml_service/
│   ├── main.py
│   ├── requirements.txt
│   ├── model/
│   └── tests/
│
└── README.md
```

---

# API Reference

All protected endpoints require:

```http
Authorization: Bearer <JWT>
```

## Authentication

| Method | Endpoint             | Description                  |
| ------ | -------------------- | ---------------------------- |
| `POST` | `/api/auth/register` | Register an employee         |
| `POST` | `/api/auth/login`    | Authenticate and receive JWT |

## Tickets

| Method  | Endpoint                           | Description                      |
| ------- | ---------------------------------- | -------------------------------- |
| `POST`  | `/api/tickets`                     | Create a ticket                  |
| `GET`   | `/api/tickets`                     | List role-scoped tickets         |
| `GET`   | `/api/tickets/{id}`                | Retrieve ticket details          |
| `PATCH` | `/api/tickets/{id}/status`         | Update ticket status             |
| `PATCH` | `/api/tickets/{id}/assign`         | Assign an agent                  |
| `PATCH` | `/api/tickets/{id}/unassign`       | Remove assignment                |
| `GET`   | `/api/tickets/review-queue`        | View classification review queue |
| `PATCH` | `/api/tickets/{id}/classification` | Apply manual classification      |

Ticket listing supports:

```text
?keyword=<search-term>
?status=<status>
```

## Teams

| Method | Endpoint          | Description           |
| ------ | ----------------- | --------------------- |
| `GET`  | `/api/teams`      | List support teams    |
| `GET`  | `/api/teams/{id}` | Retrieve team details |

## ML Service

| Method | Endpoint   | Description             |
| ------ | ---------- | ----------------------- |
| `GET`  | `/health`  | ML service health check |
| `POST` | `/predict` | Classify ticket text    |

---

# Example Classification Request

```http
POST /predict
Content-Type: application/json
```

```json
{
  "subject": "VPN connection failure",
  "description": "I am unable to connect to the company VPN from my laptop."
}
```

Example response:

```json
{
  "category": "Access",
  "confidence": 0.94
}
```

The Spring Boot service then applies the configured confidence policy:

```text
0.94 >= 0.80
      ↓
Automatic classification
      ↓
Access
      ↓
IT Access
```

A lower-confidence prediction follows the manual-review path instead.

---

# Configuration

The application is configured through environment variables.

| Variable                  | Purpose                            | Default                                               |
| ------------------------- | ---------------------------------- | ----------------------------------------------------- |
| `DB_URL`                  | PostgreSQL JDBC URL                | `jdbc:postgresql://localhost:5432/it_ticket_platform` |
| `DB_USERNAME`             | PostgreSQL username                | `postgres`                                            |
| `DB_PASSWORD`             | PostgreSQL password                | Empty                                                 |
| `JWT_SECRET`              | JWT signing secret                 | Development value                                     |
| `JWT_EXPIRATION_MS`       | JWT lifetime                       | `86400000`                                            |
| `ML_SERVICE_URL`          | FastAPI service URL                | `http://localhost:8000`                               |
| `ML_CONFIDENCE_THRESHOLD` | Automatic classification threshold | `0.80`                                                |
| `ML_CONNECT_TIMEOUT_MS`   | ML connection timeout              | `1000`                                                |
| `ML_READ_TIMEOUT_MS`      | ML response timeout                | `3000`                                                |
| `MODEL_PATH`              | Model artifact location            | `./model/ticket_classifier_calibrated.joblib`         |
| `SLA_MONITOR_DELAY_MS`    | SLA monitoring interval            | `60000`                                               |

For anything beyond local development, use a strong secret-management strategy rather than committing credentials to source control.

---

# Getting Started

## Prerequisites

Install:

* Java 17+
* Maven 3.9+
* Python 3.10+
* PostgreSQL 14+

---

## 1. Create the Database

```bash
createdb it_ticket_platform
```

Configure credentials if necessary:

```bash
export DB_USERNAME="postgres"
export DB_PASSWORD="<your-password>"
```

---

## 2. Start the ML Service

```bash
cd ml_service

python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

uvicorn main:app --host 127.0.0.1 --port 8000
```

The service expects the configured model artifact at:

```text
./model/ticket_classifier_calibrated.joblib
```

If the model is unavailable, the service reports an unavailable state and the Spring Boot application falls back to manual classification.

---

## 3. Start the Spring Boot API

```bash
cd backend

mvn spring-boot:run
```

The API will be available on the configured Spring Boot port.

---

## 4. Start the Frontend

```bash
cd frontend

python3 -m http.server 5500
```

Open:

```text
http://localhost:5500
```

---

# Development Accounts

Local development accounts are seeded automatically.

| Role          | Email                  | Password      |
| ------------- | ---------------------- | ------------- |
| Employee      | `employee@example.com` | `Employee123` |
| Agent         | `agent@example.com`    | `Agent123`    |
| Administrator | `admin@example.com`    | `Admin123`    |

> **Security:** These credentials are intended only for local development. Change or remove them before any non-development deployment.

---

# Testing

## Backend

```bash
cd backend

DB_USERNAME="$(whoami)" mvn test
```

## ML Service

```bash
cd ml_service

.venv/bin/python -m pytest -q
```

The test suites cover application behavior and classifier-service functionality independently.

---

# Design Decisions

## 1. Spring Boot as the System of Record

Business-critical ticket state is owned by the Spring Boot application rather than the ML service.

This prevents the classifier from becoming responsible for:

* ticket persistence
* authentication
* authorization
* workflow transitions
* assignment
* SLA state

The ML service remains focused on inference.

---

## 2. Confidence-Based Human Review

Automatic classification is useful only when the model is sufficiently confident.

Instead of blindly trusting every prediction:

```text
High confidence → Automatic routing
Low confidence  → Human review
```

This creates a human-in-the-loop mechanism that can reduce the impact of incorrect classifications.

---

## 3. Deterministic Routing

The ML model predicts the **category**.

The application determines the **team**.

```text
ML:
Ticket → Category

Business Rule:
Category → Support Team
```

This separation means support-team assignment remains deterministic even when the ML model is retrained.

---

## 4. Graceful Degradation

The ticket-management system should continue accepting tickets even if the classification service is temporarily unavailable.

Therefore:

```text
ML available + confident
        → automatic routing

ML available + uncertain
        → manual review

ML unavailable
        → manual review
```

The platform therefore treats ML as an assistive component rather than a single point of failure for ticket creation.

---

# ML Evaluation

The classifier was evaluated using separate training, validation, and test datasets.

The calibrated model achieved approximately:

| Metric        |     Result |
| ------------- | ---------: |
| Test Accuracy | **86.49%** |
| Macro F1      | **86.62%** |
| Weighted F1   | **86.49%** |

Validation threshold analysis was also performed to understand the trade-off between automatic routing coverage and prediction accuracy.

| Confidence Threshold | Auto-Routed Tickets | Auto Accuracy |
| -------------------: | ------------------: | ------------: |
|                 0.50 |              93.68% |        88.90% |
|                 0.60 |              84.98% |        92.10% |
|                 0.70 |              75.23% |        94.86% |
|                 0.75 |              69.72% |        96.36% |
|                 0.80 |              63.91% |        97.38% |

The deployed configuration uses:

```text
ML_CONFIDENCE_THRESHOLD = 0.80
```

This intentionally favors higher-confidence automatic routing while allowing uncertain tickets to enter manual review.

---

# Reliability Considerations

The architecture explicitly handles several failure scenarios.

| Failure                       | System Behavior                                           |
| ----------------------------- | --------------------------------------------------------- |
| ML service unavailable        | Ticket continues through manual review                    |
| ML model missing              | Prediction unavailable; manual workflow remains available |
| Low classification confidence | Manual classification required                            |
| Invalid status transition     | API rejects the request                                   |
| Unauthorized access           | Spring Security rejects the request                       |
| SLA deadline exceeded         | Ticket marked `BREACHED`                                  |
| SLA approaching deadline      | Ticket marked `AT_RISK`                                   |

This keeps the core ticket workflow operational even when auxiliary components fail.

---

# Security

Security controls include:

* JWT-based authentication
* BCrypt password hashing
* Role-based authorization
* Protected ticket endpoints
* Role-scoped ticket access
* Environment-based secret configuration
* Controlled ticket state transitions

Production deployments should additionally use:

* HTTPS/TLS
* Managed secrets
* Database access restrictions
* Secure cookie/token policies where applicable
* Rate limiting
* Centralized logging
* Dependency vulnerability scanning
* Production-grade monitoring

---

# Observability & Production Roadmap

The current system provides the core application workflow. Potential production extensions include:

### Infrastructure

* Docker / Docker Compose
* Kubernetes deployment
* Reverse proxy / API gateway
* Horizontal API scaling

### Reliability

* Redis caching
* Apache Kafka for asynchronous ticket events
* Retry and circuit-breaker policies
* Distributed tracing

### Observability

* Prometheus metrics
* Grafana dashboards
* Centralized structured logging
* Alerting for SLA breaches and service failures

### ML Operations

* Model versioning
* Automated retraining pipeline
* Feature/model drift monitoring
* Prediction-quality monitoring
* Feedback-driven retraining

### AI Assistance

A future AI layer could provide:

* Ticket summarization
* Suggested troubleshooting steps
* Similar-ticket retrieval
* Agent assistance
* Knowledge-base retrieval using RAG

These capabilities would complement the existing deterministic workflow rather than replacing core business rules.

---

# Project Status

**Current status:** Core platform implemented.

Implemented:

* [x] JWT authentication
* [x] Role-based authorization
* [x] Ticket creation and management
* [x] Controlled ticket lifecycle
* [x] ML-based classification
* [x] Confidence-based manual review
* [x] Deterministic team routing
* [x] Priority calculation
* [x] SLA deadline calculation
* [x] SLA monitoring
* [x] Ticket search and filtering
* [x] Agent assignment
* [x] Classification review queue
* [x] Backend tests
* [x] ML service tests

Planned extensions:

* [ ] Docker Compose deployment
* [ ] OpenAPI / Swagger documentation
* [ ] Redis caching
* [ ] Kafka-based event processing
* [ ] Prometheus/Grafana observability
* [ ] Model monitoring and retraining
* [ ] Knowledge-base RAG
* [ ] Automated email-to-ticket ingestion

---

# Engineering Principles

The project follows a few core principles:

**Separation of concerns**

> Business logic belongs in the backend; ML inference belongs in the ML service.

**Fail safely**

> ML failure should not prevent ticket creation.

**Human in the loop**

> Low-confidence predictions should be reviewable instead of being blindly trusted.

**Deterministic business rules**

> Critical routing and workflow decisions should remain predictable and auditable.

**Configuration over hard-coding**

> Thresholds, timeouts, service URLs, and secrets are externally configurable.

**Testable services**

> Backend and ML components can be tested independently.

---

# License

This project is currently intended as a portfolio and educational software project.

If distributed publicly, add an appropriate open-source license such as MIT or Apache-2.0 and include the corresponding `LICENSE` file.

---

## Author

**Kamal Nath U.**

B.Tech Computer Science & Engineering
SRM Institute of Science and Technology

Focused on backend engineering, distributed systems, machine learning applications, and AI-powered software systems.
