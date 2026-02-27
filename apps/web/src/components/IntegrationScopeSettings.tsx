import { useEffect, useMemo, useState } from "react";
import { getCanvasStatus, triggerCanvasSync } from "../lib/api";
import { useI18n } from "../lib/i18n";
import {
  loadIntegrationScopeSettings,
  saveIntegrationScopeSettings
} from "../lib/storage";
import { IconTarget } from "./Icons";
import type { CanvasStatus, IntegrationScopeSettings } from "../types";

/** Default time window: 7 days past, 180 days future */
const DEFAULT_PAST_DAYS = 7;
const DEFAULT_FUTURE_DAYS = 180;

export function IntegrationScopeSettings(): JSX.Element {
  const { t } = useI18n();
  const [settings, setSettings] = useState<IntegrationScopeSettings>(loadIntegrationScopeSettings());
  const [canvasStatus, setCanvasStatus] = useState<CanvasStatus>({
    baseUrl: "",
    lastSyncedAt: null,
    courses: []
  });
  const [applyLoading, setApplyLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async (): Promise<void> => {
      const status = await getCanvasStatus();
      setCanvasStatus(status);
    };

    void load();
  }, []);

  useEffect(() => {
    if (settings.canvasCourseIds.length === 0) {
      return;
    }

    const availableCourseIds = new Set(canvasStatus.courses.map((course) => course.id));
    const nextCanvasCourseIds = settings.canvasCourseIds.filter((courseId) => availableCourseIds.has(courseId));
    if (nextCanvasCourseIds.length === settings.canvasCourseIds.length) {
      return;
    }

    const nextSettings: IntegrationScopeSettings = {
      ...settings,
      canvasCourseIds: nextCanvasCourseIds
    };
    setSettings(nextSettings);
    saveIntegrationScopeSettings(nextSettings);
  }, [canvasStatus.courses, settings]);

  const selectedCanvasSet = useMemo(() => new Set(settings.canvasCourseIds), [settings.canvasCourseIds]);

  const updateSettings = (next: IntegrationScopeSettings): void => {
    setSettings(next);
    saveIntegrationScopeSettings(next);
  };

  const toggleCanvasCourse = (courseId: number): void => {
    const nextIds = selectedCanvasSet.has(courseId)
      ? settings.canvasCourseIds.filter((id) => id !== courseId)
      : [...settings.canvasCourseIds, courseId];

    updateSettings({
      ...settings,
      canvasCourseIds: nextIds
    });
  };

  const handleApply = async (): Promise<void> => {
    setApplyLoading(true);
    setError("");
    setMessage("");

    const canvasCourseIds = Array.from(new Set(settings.canvasCourseIds.filter((id) => Number.isInteger(id) && id > 0)));

    const canvasResult = await triggerCanvasSync(undefined, {
      courseIds: canvasCourseIds,
      pastDays: DEFAULT_PAST_DAYS,
      futureDays: DEFAULT_FUTURE_DAYS
    });

    if (canvasResult.success) {
      setMessage(t("Canvas synced successfully."));
    } else {
      setError(canvasResult.error ?? t("Sync completed with errors."));
    }

    const latestCanvasStatus = await getCanvasStatus();
    setCanvasStatus(latestCanvasStatus);
    setApplyLoading(false);
  };

  return (
    <section className="scope-settings">
      <p className="scope-settings-desc">{t("Select which Canvas courses to track. TP schedule is managed via the iCal connector above.")}</p>

      <div className="scope-settings-card">
        <div className="scope-settings-card-header">
          <div className="scope-settings-card-title">
            <IconTarget size={16} />
            <h3>{t("Canvas course scope")}</h3>
          </div>
          <span className="scope-settings-count">{settings.canvasCourseIds.length} {t("selected")}</span>
        </div>

        {canvasStatus.courses.length === 0 ? (
          <p className="scope-settings-empty">{t("No Canvas courses available yet. Connect Canvas above, then sync.")}</p>
        ) : (
          <>
            <div className="scope-settings-actions">
              <button
                type="button"
                className="scope-settings-action-btn"
                onClick={() => updateSettings({ ...settings, canvasCourseIds: canvasStatus.courses.map((course) => course.id) })}
              >
                {t("Select all")}
              </button>
              <button
                type="button"
                className="scope-settings-action-btn"
                onClick={() => updateSettings({ ...settings, canvasCourseIds: [] })}
              >
                {t("Clear")}
              </button>
            </div>
            <div className="scope-course-grid">
              {canvasStatus.courses.map((course) => {
                const selected = selectedCanvasSet.has(course.id);
                const displayName = course.name.startsWith(course.course_code)
                  ? course.name
                  : `${course.course_code} — ${course.name}`;
                return (
                  <button
                    key={course.id}
                    type="button"
                    className={`scope-course-chip${selected ? " scope-course-chip-active" : ""}`}
                    onClick={() => toggleCanvasCourse(course.id)}
                    aria-pressed={selected}
                  >
                    <span className="scope-course-check">{selected ? "✓" : ""}</span>
                    <span className="scope-course-name">{displayName}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <button type="button" className="scope-sync-btn" onClick={() => void handleApply()} disabled={applyLoading || canvasStatus.courses.length === 0}>
        {applyLoading ? t("Syncing...") : t("Sync now")}
      </button>

      {message && <p className="scope-settings-message">{message}</p>}
      {error && <p className="scope-settings-error">{error}</p>}
    </section>
  );
}
