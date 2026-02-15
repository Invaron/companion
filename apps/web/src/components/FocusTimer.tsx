import { useEffect, useRef, useState } from "react";
import { updateContext } from "../lib/api";
import { UserContext } from "../types";

interface FocusTimerProps {
  onUpdated?: () => Promise<void>;
}

type TimerState = "idle" | "work" | "break" | "paused";
type WorkDuration = 25 | 45 | 60;
type BreakDuration = 5 | 10 | 15;

export function FocusTimer({ onUpdated }: FocusTimerProps): JSX.Element {
  const [workDuration, setWorkDuration] = useState<WorkDuration>(25);
  const [breakDuration, setBreakDuration] = useState<BreakDuration>(5);
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const formatTime = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const startWorkSession = async (): Promise<void> => {
    const durationSeconds = workDuration * 60;
    setRemainingSeconds(durationSeconds);
    setTimerState("work");
    setSessionStartTime(Date.now());
    
    // Update context to focus mode
    try {
      await updateContext({ mode: "focus" });
      if (onUpdated) {
        await onUpdated();
      }
    } catch {
      // Continue even if context update fails
    }
  };

  const startBreakSession = async (): Promise<void> => {
    const durationSeconds = breakDuration * 60;
    setRemainingSeconds(durationSeconds);
    setTimerState("break");
    
    // Update context to recovery mode during break
    try {
      await updateContext({ mode: "recovery" });
      if (onUpdated) {
        await onUpdated();
      }
    } catch {
      // Continue even if context update fails
    }
  };

  const pauseTimer = (): void => {
    setTimerState("paused");
  };

  const resumeTimer = (): void => {
    if (remainingSeconds > 0) {
      setTimerState(timerState === "paused" ? "work" : timerState);
    }
  };

  const stopTimer = async (): Promise<void> => {
    setTimerState("idle");
    setRemainingSeconds(0);
    setSessionStartTime(null);
    
    // Return context to balanced mode
    try {
      await updateContext({ mode: "balanced" });
      if (onUpdated) {
        await onUpdated();
      }
    } catch {
      // Continue even if context update fails
    }
  };

  useEffect(() => {
    if (timerState === "work" || timerState === "break") {
      intervalRef.current = window.setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            // Timer completed
            if (timerState === "work") {
              void startBreakSession();
            } else {
              setTimerState("idle");
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [timerState, breakDuration]);

  const getTotalSessionMinutes = (): number => {
    if (!sessionStartTime) return 0;
    return Math.floor((Date.now() - sessionStartTime) / 60000);
  };

  const getProgressPercent = (): number => {
    const totalDuration = timerState === "work" ? workDuration * 60 : breakDuration * 60;
    if (totalDuration === 0) return 0;
    return Math.max(0, Math.min(100, ((totalDuration - remainingSeconds) / totalDuration) * 100));
  };

  const isActive = timerState === "work" || timerState === "break";
  const isPaused = timerState === "paused";

  return (
    <section className="panel focus-timer-panel">
      <header className="panel-header">
        <h2>Focus Timer</h2>
        {timerState === "work" && (
          <span className="session-badge session-badge-work">Work Session</span>
        )}
        {timerState === "break" && (
          <span className="session-badge session-badge-break">Break Time</span>
        )}
        {timerState === "paused" && (
          <span className="session-badge session-badge-paused">Paused</span>
        )}
      </header>

      {timerState === "idle" && (
        <div className="timer-config">
          <div className="timer-config-group">
            <label>
              Work Duration
              <select
                value={workDuration}
                onChange={(e) => setWorkDuration(Number(e.target.value) as WorkDuration)}
              >
                <option value={25}>25 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </select>
            </label>
            <label>
              Break Duration
              <select
                value={breakDuration}
                onChange={(e) => setBreakDuration(Number(e.target.value) as BreakDuration)}
              >
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
                <option value={15}>15 min</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            className="timer-start-button"
            onClick={() => void startWorkSession()}
          >
            Start Focus Session
          </button>
        </div>
      )}

      {isActive || isPaused ? (
        <div className="timer-active">
          <div className="timer-display">
            <div className="timer-time">{formatTime(remainingSeconds)}</div>
            <div className="timer-progress-bar">
              <div
                className={`timer-progress-fill ${timerState === "work" ? "timer-progress-work" : "timer-progress-break"}`}
                style={{ width: `${getProgressPercent()}%` }}
              />
            </div>
          </div>

          {sessionStartTime && timerState === "work" && (
            <p className="timer-session-info muted">
              Session duration: {getTotalSessionMinutes()} minutes
            </p>
          )}

          <div className="timer-controls">
            {!isPaused ? (
              <button type="button" onClick={pauseTimer} className="timer-button-secondary">
                Pause
              </button>
            ) : (
              <button type="button" onClick={resumeTimer} className="timer-button-primary">
                Resume
              </button>
            )}
            <button type="button" onClick={() => void stopTimer()} className="timer-button-danger">
              Stop
            </button>
          </div>
        </div>
      ) : null}

      <div className="timer-info">
        <p className="muted-small">
          This Pomodoro-style timer helps you maintain focus during work sessions and ensures
          proper breaks. Your context mode will automatically switch to "focus" during work and
          "recovery" during breaks.
        </p>
      </div>
    </section>
  );
}
