# AXIS API Documentation

This document describes all HTTP endpoints exposed by the AXIS companion server (`apps/server`).

## Base URL

- Local development: `http://localhost:8787`
- Production: Deploy-specific URL

## Endpoints

### GET `/api/health`

Health check endpoint to verify server availability.

**Request**

No parameters required.

**Response** `200 OK`

```json
{
  "status": "ok"
}
```

**Example**

```bash
curl http://localhost:8787/api/health
```

---

### GET `/api/dashboard`

Retrieve the current dashboard snapshot including agent states, notifications, events, and summary metrics.

**Request**

No parameters required.

**Response** `200 OK`

```json
{
  "generatedAt": "2026-02-14T15:00:00.000Z",
  "summary": {
    "todayFocus": "Deep work + assignment completion",
    "pendingDeadlines": 3,
    "mealCompliance": 76,
    "digestReady": true
  },
  "agentStates": [
    {
      "name": "notes",
      "status": "idle",
      "lastRunAt": "2026-02-14T14:59:55.000Z",
      "lastEvent": {
        "id": "evt-123",
        "source": "notes",
        "eventType": "note.created",
        "priority": "low",
        "timestamp": "2026-02-14T14:59:55.000Z",
        "payload": {}
      }
    }
  ],
  "notifications": [
    {
      "id": "notif-1",
      "title": "Deadline alert",
      "message": "Problem Set 4 for Algorithms is approaching.",
      "priority": "high",
      "source": "assignment-tracker",
      "timestamp": "2026-02-14T14:59:50.000Z"
    }
  ],
  "events": []
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `generatedAt` | string | ISO 8601 timestamp of snapshot generation |
| `summary.todayFocus` | string | Contextual focus message based on user mode |
| `summary.pendingDeadlines` | number | Count of approaching assignment deadlines |
| `summary.mealCompliance` | number | Meal tracking compliance score (0-100) |
| `summary.digestReady` | boolean | Whether video digest is ready for viewing |
| `agentStates` | array | Status of all registered agents |
| `notifications` | array | Recent notifications (max 40) |
| `events` | array | Recent agent events (max 100) |

**Agent Status Values**

- `idle` — Agent is ready to run
- `running` — Agent is currently executing
- `error` — Agent encountered an error in last run

**Priority Values**

- `low` — Informational
- `medium` — Worth attention
- `high` — Action recommended
- `critical` — Immediate action required

**Example**

```bash
curl http://localhost:8787/api/dashboard
```

---

### POST `/api/context`

Update the user context to adjust system behavior. All fields are optional; only provided fields are updated.

**Request** `application/json`

```json
{
  "stressLevel": "low",
  "energyLevel": "high",
  "mode": "focus"
}
```

**Request Fields**

| Field | Type | Required | Values | Description |
|-------|------|----------|--------|-------------|
| `stressLevel` | string | No | `low`, `medium`, `high` | Current stress level |
| `energyLevel` | string | No | `low`, `medium`, `high` | Current energy level |
| `mode` | string | No | `focus`, `balanced`, `recovery` | Operating mode |

**Mode Descriptions**

- `focus` — Prioritizes deep work and assignment completion
- `balanced` — Balanced schedule with deadlines first
- `recovery` — Light planning and recovery tasks

**Response** `200 OK`

```json
{
  "context": {
    "stressLevel": "low",
    "energyLevel": "high",
    "mode": "focus"
  }
}
```

Returns the complete updated context (including any unchanged fields).

**Response** `400 Bad Request`

```json
{
  "error": "Invalid context payload",
  "issues": [
    {
      "code": "invalid_enum_value",
      "path": ["mode"],
      "message": "Invalid enum value. Expected 'focus' | 'balanced' | 'recovery', received 'unknown'"
    }
  ]
}
```

Returned when request validation fails. The `issues` array contains detailed validation errors from Zod.

**Example**

```bash
curl -X POST http://localhost:8787/api/context \
  -H "Content-Type: application/json" \
  -d '{"mode":"focus","energyLevel":"high"}'
```

---

## Data Types

### AgentName

Valid agent identifiers:

- `notes` — Notes management agent
- `lecture-plan` — Lecture planning agent
- `assignment-tracker` — Assignment tracking agent
- `food-tracking` — Nutrition tracking agent
- `social-highlights` — Social media highlights agent
- `video-editor` — Video digest creation agent
- `orchestrator` — Master coordination agent

### AgentEvent

Structure for events emitted by agents:

```typescript
{
  id: string;           // Unique event identifier
  source: AgentName;    // Agent that created the event
  eventType: string;    // Event type (e.g., "assignment.deadline")
  priority: Priority;   // Event priority
  timestamp: string;    // ISO 8601 timestamp
  payload: unknown;     // Event-specific data
}
```

### Notification

Structure for user notifications:

```typescript
{
  id: string;           // Unique notification identifier
  title: string;        // Notification title
  message: string;      // Notification body
  priority: Priority;   // Notification priority
  source: AgentName;    // Agent that created the notification
  timestamp: string;    // ISO 8601 timestamp
}
```

---

## Error Handling

The API uses standard HTTP status codes:

- `200 OK` — Request succeeded
- `400 Bad Request` — Invalid request payload or parameters
- `500 Internal Server Error` — Server-side error

Error responses include a JSON object with an `error` field describing the issue. Validation errors (400) include an `issues` array with detailed field-level errors.

---

## CORS

The API enables CORS for all origins in development. Adjust CORS configuration in `apps/server/src/index.ts` for production deployments.

---

## Authentication

Currently, the API has no authentication layer. It is designed for personal use on a trusted network. Add authentication middleware before exposing to the public internet.

---

## Rate Limiting

No rate limiting is currently implemented. Consider adding rate limiting for production deployments.

---

## Related Documentation

- [API Contracts](./contracts.md) — Detailed payload schemas
- [Dev Environment Guide](./dev-environment.md) — Local setup instructions
- [Project Brief](./project-brief.md) — AXIS product overview
