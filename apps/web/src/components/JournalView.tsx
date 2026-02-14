import { useState } from "react";
import { JournalEntry } from "../types";
import { addJournalEntry, loadJournalEntries } from "../lib/storage";

export function JournalView(): JSX.Element {
  const [entries, setEntries] = useState<JournalEntry[]>(loadJournalEntries());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!text.trim()) return;

    setBusy(true);
    try {
      const entry = addJournalEntry(text.trim());
      setEntries((prev) => [entry, ...prev]);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  return (
    <section className="panel journal-panel">
      <header className="panel-header">
        <h2>Journal</h2>
        <span className="journal-count">{entries.length} entries</span>
      </header>

      <form className="journal-input-form" onSubmit={handleSubmit}>
        <textarea
          className="journal-textarea"
          placeholder="What's on your mind? Quick thoughts, reflections, or to-dos..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !text.trim()}>
          {busy ? "Saving..." : "Add Entry"}
        </button>
      </form>

      {entries.length > 0 ? (
        <ul className="journal-list">
          {entries.map((entry) => (
            <li key={entry.id} className="journal-entry">
              <p className="journal-entry-text">{entry.text}</p>
              <time className="journal-entry-time">{formatDate(entry.timestamp)}</time>
            </li>
          ))}
        </ul>
      ) : (
        <p className="journal-empty">No entries yet. Start journaling to track your thoughts.</p>
      )}
    </section>
  );
}
