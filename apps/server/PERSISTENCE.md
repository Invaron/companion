# SQLite-Backed Persistence in RuntimeStore

## Status: ✅ COMPLETE

The RuntimeStore has been fully implemented with SQLite-backed file persistence using the `better-sqlite3` library. All data persists across application restarts.

## Implementation Details

### Database Backend
- **Library**: `better-sqlite3` v12.6.2
- **Default database file**: `companion.db` (configurable via constructor parameter)
- **Test databases**: Use `:memory:` for fast, isolated tests
- **Foreign keys**: Enabled via `PRAGMA foreign_keys = ON`

### Persisted Data Types

All application data is stored in SQLite tables:

1. **Agent Events** (`agent_events`)
   - Event history from all agents (notes, lecture-plan, assignment-tracker, orchestrator)
   - Auto-trimmed to 100 most recent events

2. **Notifications** (`notifications`)
   - Push notification history
   - Auto-trimmed to 40 most recent notifications

3. **Chat Messages** (`chat_messages`)
   - Conversation history with Gemini AI
   - Supports pagination
   - Auto-trimmed to 500 most recent messages

4. **Journal Entries** (`journal_entries`)
   - User journal entries with tags and photo attachments
   - Version tracking for conflict resolution
   - Auto-trimmed to 100 most recent entries

5. **Tags** (`tags`)
   - Tag definitions for journal entries
   - Many-to-many relationship via `journal_entry_tags`

6. **Schedule Events** (`schedule_events`)
   - Lecture schedule with recurrence support
   - Auto-trimmed to 200 most recent events

7. **Deadlines** (`deadlines`)
   - Assignment deadlines with priority and completion status
   - Auto-trimmed to 200 most recent deadlines

8. **Habits** (`habits`)
   - Habit definitions with check-in history
   - Streak calculation and grace periods

9. **Goals** (`goals`)
   - Goal definitions with check-in history
   - Progress tracking

10. **User Context** (`user_context`)
    - Stress level, energy level, and mode
    - Singleton record (id = 1)
    - History tracked in `context_history`

11. **Notification Preferences** (`notification_preferences`)
    - Quiet hours, priority thresholds, category toggles
    - Singleton record (id = 1)

12. **Push Subscriptions** (`push_subscriptions`)
    - Web Push subscription endpoints and keys
    - Auto-trimmed to 50 subscriptions

13. **Push Delivery Metrics** (`push_delivery_metrics`)
    - Delivery success/failure tracking
    - Singleton record (id = 1)

14. **Agent States** (`agent_states`)
    - Current status and last event for each agent

15. **Email Digests** (`email_digests`)
    - Generated email summaries
    - Auto-trimmed to 50 most recent digests

16. **Locations** (`locations`)
    - User location data with named places
    - Location history for context tracking

17. **Sync Queue** (`sync_queue`)
    - Offline sync operations queue
    - Background sync for offline-first PWA

## Schema Management

### Initialization
- Schema is created automatically on first run via `initializeSchema()`
- Tables are created with `CREATE TABLE IF NOT EXISTS`
- Indexes are created for performance-critical queries
- Foreign key constraints ensure referential integrity

### Migrations
- Schema changes handled via conditional checks (e.g., checking for column existence)
- Example: Photos column added to `journal_entries` via `ALTER TABLE` if missing

### Defaults
- Default records inserted for agents, user context, notification preferences, and metrics
- Starter habits and goals seeded on fresh database
- Uses `INSERT OR IGNORE` to avoid duplicates

## Data Integrity

### Auto-trimming
Most tables have configurable max sizes to prevent unbounded growth:
```typescript
private readonly maxEvents = 100;
private readonly maxNotifications = 40;
private readonly maxChatMessages = 500;
private readonly maxJournalEntries = 100;
private readonly maxScheduleEvents = 200;
private readonly maxDeadlines = 200;
// ... etc
```

When limits are exceeded, oldest records are deleted automatically.

### Transaction Safety
- All multi-step operations use SQLite transactions
- Example: Journal entry tags use `this.db.transaction()` for atomicity

### Insert Order
All tables include an `insertOrder` column for precise chronological ordering:
```sql
insertOrder INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000000)
```

This uses SQLite's microsecond-precision timestamp for guaranteed ordering even with high-frequency inserts.

## Usage

### Production (File-backed)
```typescript
import { RuntimeStore } from "./store.js";

// Uses default companion.db file
const store = new RuntimeStore();

// Or specify custom path
const store = new RuntimeStore("/path/to/database.db");
```

### Testing (In-memory)
```typescript
import { RuntimeStore } from "./store.js";

// Fast, isolated in-memory database
const store = new RuntimeStore(":memory:");
```

### File Paths
```typescript
// Relative to current working directory
const store = new RuntimeStore("data/companion.db");

// Absolute path
const store = new RuntimeStore("/var/lib/companion/companion.db");

// Temporary file
const store = new RuntimeStore("/tmp/test-${Date.now()}.db");
```

## Verification

Run the included verification script to confirm persistence works:

```bash
cd apps/server
npm run build
node verify-persistence.mjs
```

This script:
1. Creates a test database
2. Adds schedule events, deadlines, journal entries, and preferences
3. Closes the store instance (simulating app restart)
4. Creates a new store instance from the same file
5. Verifies all data persisted correctly
6. Confirms appending new data works
7. Cleans up test database

Expected output:
```
✅ SUCCESS: SQLite-backed persistence is working correctly!

The RuntimeStore implementation:
  • Uses better-sqlite3 for file-backed persistence
  • Stores all data in SQLite (companion.db by default)
  • Persists schedules, deadlines, journals, preferences, and context
  • Data survives app restarts
  • All data integrity checks passed
```

## Test Coverage

All 233 tests in the test suite pass, including:
- `store.*.test.ts` — Store functionality tests
- `orchestrator.*.test.ts` — Orchestrator integration tests
- `agents/*.test.ts` — Agent module tests

Tests use `:memory:` databases for speed and isolation.

## Migration from In-Memory Storage

**N/A** — The RuntimeStore has always used SQLite since its initial implementation. There was never an in-memory version in production.

## Backup and Restore

### Manual Backup
Simply copy the `companion.db` file:
```bash
cp companion.db companion.backup.db
```

### Export API
Use the export endpoint to get all data as JSON:
```bash
curl http://localhost:8787/api/export > backup.json
```

### Import API
Restore from JSON export:
```bash
curl -X POST http://localhost:8787/api/import \
  -H "Content-Type: application/json" \
  -d @backup.json
```

## Performance Considerations

### Indexes
Key indexes are created for frequently queried columns:
- `notification_interactions(timestamp, interactionType, notificationSource)`
- `locations(timestamp, label)`
- `location_history(timestamp, locationId)`
- `sync_queue(status, createdAt)`

### Pagination
Large result sets support pagination:
- Chat history: `getChatHistory({ page: 1, pageSize: 20 })`
- Avoids loading entire dataset into memory

### Connection Pooling
SQLite is single-threaded and file-based, so connection pooling isn't needed. The single `Database` instance is reused for all operations.

## Security

### Database File
- **Location**: `companion.db` in the server's working directory
- **Gitignore**: `*.db` files are excluded from version control
- **Permissions**: Ensure file permissions restrict access to the server process only

### SQL Injection
- All queries use prepared statements with parameter binding
- Example: `.prepare("SELECT * FROM deadlines WHERE id = ?").get(id)`
- Never use string concatenation for queries

## Known Limitations

1. **Single instance**: SQLite doesn't support concurrent writers. Only one server instance should access the database file at a time.

2. **Auto-trimming**: Older data is automatically deleted when limits are reached. For long-term archival, use the export API periodically.

3. **Photos inline**: Journal photos are stored as base64-encoded data URLs directly in the database. For large photo libraries, consider external storage.

4. **No cloud sync**: The database is local to the server. For multi-device sync, implement server-to-server replication or use a cloud database.

## Future Enhancements

Potential improvements (not currently planned):

- [ ] Configurable auto-trim limits via environment variables
- [ ] Automatic periodic exports to cloud storage
- [ ] Write-ahead logging (WAL) mode for better concurrency
- [ ] Database vacuuming on startup to reclaim space
- [ ] Migration framework for schema evolution
- [ ] Compression for old journal entries

## Conclusion

The RuntimeStore provides robust, file-backed persistence using SQLite. All schedules, deadlines, preferences, journals, and other application state survive server restarts. The implementation is production-ready and thoroughly tested.

Feature ID: `persistent-runtime-storage`  
Status: ✅ **COMPLETE**  
Last verified: 2026-02-16
