# IT Ticket Auto-Routing and SLA Management Platform

A full-stack service desk application for creating, classifying, routing, and tracking IT support tickets. It combines a Spring Boot API, a FastAPI classification service, PostgreSQL, and a lightweight browser client.

## Highlights

- JWT-based authentication with employee, agent, and administrator roles
- Role-scoped ticket access and assignment workflows
- Controlled ticket lifecycle: \`OPEN\` -> \`IN_PROGRESS\` -> \`RESOLVED\` -> \`CLOSED\`
- ML-assisted category prediction with manual-review fallback
- Deterministic routing from category to support team
- Keyword-based priority calculation and configurable SLA targets
- SLA monitoring for \`AT_RISK\`, \`BREACHED\`, and resolved tickets
- Search, status filtering, queue review, and ticket detail views in the web client

## Architecture

\`\`\`text
Browser client
    |
    v
Spring Boot API <----> PostgreSQL
    |
    v
FastAPI classification service
    |
    v
TF-IDF + calibrated Linear SVM model
\`\`\`

The Spring Boot API remains the system of record. If the classifier is unavailable or a prediction does not meet the configured confidence threshold, the ticket is saved for manual review rather than rejected.

## Technology

| Layer | Technology |
|---|---|
| Web client | HTML, CSS, JavaScript |
| API | Java 17, Spring Boot, Spring Security, JPA/Hibernate |
| Authentication | JWT and BCrypt |
| Database | PostgreSQL |
| Classification service | Python, FastAPI, scikit-learn, joblib |
| Build and test | Maven and pytest |

## Repository Layout

\`\`\`text
backend/       Spring Boot API, persistence, security, routing, and SLA logic
frontend/      Browser client
ml_service/    FastAPI inference service, model tooling, and Python tests
\`\`\`

## Prerequisites

- Java 17 or later
- Maven 3.9 or later
- Python 3.10 or later
- PostgreSQL 14 or later

## Configuration

The services use the following environment variables. Defaults are suitable for local development except where noted.

| Variable | Purpose | Default |
|---|---|---|
| \`DB_URL\` | PostgreSQL JDBC URL | \`jdbc:postgresql://localhost:5432/it_ticket_platform\` |
| \`DB_USERNAME\` | PostgreSQL role | \`postgres\` |
| \`DB_PASSWORD\` | PostgreSQL password | Empty |
| \`JWT_SECRET\` | JWT signing secret | Development value in application properties |
| \`JWT_EXPIRATION_MS\` | JWT lifetime in milliseconds | \`86400000\` |
| \`ML_SERVICE_URL\` | Classification service URL | \`http://localhost:8000\` |
| \`ML_CONFIDENCE_THRESHOLD\` | Minimum confidence for automatic classification | \`0.80\` |
| \`ML_CONNECT_TIMEOUT_MS\` | Classification connection timeout | \`1000\` |
| \`ML_READ_TIMEOUT_MS\` | Classification read timeout | \`3000\` |
| \`MODEL_PATH\` | Path to the joblib model for FastAPI | \`./model/ticket_classifier_calibrated.joblib\` |
| \`SLA_MONITOR_DELAY_MS\` | SLA monitor interval in milliseconds | \`60000\` |

Use a strong, private \`JWT_SECRET\` outside local development.

## Run Locally

1. Create the database:

   \`\`\`bash
   createdb it_ticket_platform
   \`\`\`

2. Set local database credentials if your PostgreSQL role is not \`postgres\`:

   \`\`\`bash
   export DB_USERNAME="$(whoami)"
   export DB_PASSWORD=""
   \`\`\`

3. Start the classifier from \`ml_service/\`:

   \`\`\`bash
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
   \`\`\`

   The classifier expects a compatible joblib artifact at \`MODEL_PATH\`. Without one, its health and prediction endpoints return \`503 Service Unavailable\`; ticket creation continues through the manual-review path.

4. Start the API from \`backend/\`:

   \`\`\`bash
   mvn spring-boot:run
   \`\`\`

5. Serve the client from \`frontend/\`:

   \`\`\`bash
   python3 -m http.server 5500
   \`\`\`

Open [http://localhost:5500](http://localhost:5500).

## Development Accounts

The application seeds local development accounts at startup.

| Role | Email | Password |
|---|---|---|
| Employee | \`employee@example.com\` | \`Employee123\` |
| Agent | \`agent@example.com\` | \`Agent123\` |
| Administrator | \`admin@example.com\` | \`Admin123\` |

Change or remove these accounts before any non-development deployment.

## Roles and Ticket Workflow

| Role | Access |
|---|---|
| Employee | Create tickets, view owned tickets, and close resolved tickets |
| Agent | View assigned tickets, update assigned tickets, and review classifications |
| Administrator | View all tickets, manage assignments and status changes, and review classifications |

Tickets follow this lifecycle:

\`\`\`text
OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED
\`\`\`

The API rejects invalid, repeated, or reversed state transitions.

## Classification, Routing, Priority, and SLA

When a ticket is created, the API sends its subject and description to the classifier. Predictions meeting the confidence threshold are automatically classified and routed; lower-confidence results enter the review queue.

Category-to-team routing is deterministic:

| Category | Team |
|---|---|
| Hardware | Hardware Support |
| Access | IT Access |
| HR Support | HR Helpdesk |
| Purchase | Procurement |
| Storage | Storage/Infrastructure |
| Internal Project | Internal Projects |
| Administrative rights | Administrative Support |
| Miscellaneous | General Support |

Priority is calculated from ticket content and drives the initial SLA deadline:

| Priority | Target |
|---|---:|
| Critical | 120 minutes |
| High | 240 minutes |
| Medium | 480 minutes |
| Low | 1440 minutes |

The monitor marks unresolved tickets as \`AT_RISK\` when 20% or less of the target time remains and as \`BREACHED\` after the deadline. Resolved and closed tickets are marked \`RESOLVED\`.

## API Reference

Authenticated endpoints require:

\`\`\`text
Authorization: Bearer <JWT>
\`\`\`

| Method | Endpoint | Description |
|---|---|---|
| POST | \`/api/auth/register\` | Create an employee account |
| POST | \`/api/auth/login\` | Authenticate and receive a JWT |
| POST | \`/api/tickets\` | Create a ticket |
| GET | \`/api/tickets\` | List role-scoped tickets; supports \`keyword\` and \`status\` |
| GET | \`/api/tickets/{id}\` | Get a ticket by ID |
| PATCH | \`/api/tickets/{id}/status\` | Update ticket status |
| PATCH | \`/api/tickets/{id}/assign\` | Assign an agent |
| PATCH | \`/api/tickets/{id}/unassign\` | Remove an agent assignment |
| GET | \`/api/tickets/review-queue\` | List tickets awaiting classification review |
| PATCH | \`/api/tickets/{id}/classification\` | Apply a manual classification |
| GET | \`/api/teams\` | List support teams |
| GET | \`/api/teams/{id}\` | Get a support team |
| GET | \`/health\` | Check the classification service |
| POST | \`/predict\` | Classify text with the FastAPI service |

## Testing

Run backend tests:

\`\`\`bash
cd backend
DB_USERNAME="$(whoami)" mvn test
\`\`\`

Run classifier tests:

\`\`\`bash
cd ml_service
.venv/bin/python -m pytest -q
\`\`\`

## Deployment Notes

- Supply secrets through environment variables or a managed secret store.
- Use a production PostgreSQL instance with backups and restricted access.
- Serve the frontend through a production web server or CDN.
- Run the API and classifier behind a reverse proxy with TLS.
- Configure monitoring for API availability, classifier health, queue size, and SLA breaches.
