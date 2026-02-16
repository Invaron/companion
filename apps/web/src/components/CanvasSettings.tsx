import { useEffect, useState } from "react";
import { getCanvasStatus, triggerCanvasSync } from "../lib/api";
import { loadCanvasSettings, loadCanvasStatus, saveCanvasSettings, saveCanvasStatus } from "../lib/storage";
import type { CanvasSettings as CanvasSettingsData, CanvasStatus } from "../types";

function formatRelative(timestamp: string | null): string {
  if (!timestamp) return "Never";

  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

export function CanvasSettings(): JSX.Element {
  const [settings, setSettings] = useState<CanvasSettingsData>(loadCanvasSettings());
  const [status, setStatus] = useState<CanvasStatus>(loadCanvasStatus());
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async (): Promise<void> => {
      const nextStatus = await getCanvasStatus();
      setStatus(nextStatus);
      saveCanvasStatus(nextStatus);

      setSettings((prev) => {
        if (prev.baseUrl) return prev;
        const merged = { ...prev, baseUrl: nextStatus.baseUrl };
        saveCanvasSettings(merged);
        return merged;
      });
    };

    void load();
  }, []);

  const handleSettingChange = <K extends keyof CanvasSettingsData>(
    key: K,
    value: CanvasSettingsData[K]
  ): void => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveCanvasSettings(next);
      return next;
    });
  };

  const handleSync = async (): Promise<void> => {
    setSyncing(true);
    setMessage("");

    const result = await triggerCanvasSync(settings);
    setMessage(result.success ? "Canvas synced successfully." : result.error ?? "Canvas sync failed.");

    const nextStatus = await getCanvasStatus();
    setStatus(nextStatus);
    saveCanvasStatus(nextStatus);
    setSyncing(false);
  };

  const statusLabel = syncing ? "Syncing..." : status.lastSyncedAt ? "Connected" : "Not synced yet";
  const statusClass = syncing ? "status-running" : status.lastSyncedAt ? "status-running" : "status-idle";

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Canvas connection</h2>
        <span className={`status ${statusClass}`}>{statusLabel}</span>
      </header>

      <div className="settings-stack">
        <label>
          Canvas base URL
          <input
            type="url"
            value={settings.baseUrl}
            onChange={(event) => handleSettingChange("baseUrl", event.target.value)}
            placeholder="https://stavanger.instructure.com"
          />
        </label>

        <label>
          Access token
          <input
            type="password"
            value={settings.token}
            onChange={(event) => handleSettingChange("token", event.target.value)}
            placeholder="Paste your Canvas token"
          />
        </label>

        <div className="panel-header">
          <div>
            <p className="muted">Last synced</p>
            <strong>{formatRelative(status.lastSyncedAt)}</strong>
          </div>
          <button type="button" onClick={() => void handleSync()} disabled={syncing || !settings.token}>
            {syncing ? "Syncing..." : "Manual sync"}
          </button>
        </div>

        {message && <p>{message}</p>}

        <div>
          <p>Synced courses ({status.courses.length})</p>
          {status.courses.length === 0 ? (
            <p className="muted">No courses synced yet.</p>
          ) : (
            <ul className="list">
              {status.courses.map((course) => (
                <li key={course.id} className="list-item">
                  <div>
                    <strong>{course.name}</strong>
                    <p className="muted">{course.course_code}</p>
                  </div>
                  <span className="status status-running">{course.workflow_state}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
