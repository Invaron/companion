import { DashboardSnapshot, UserContext } from "../types";

const STORAGE_KEYS = {
  dashboard: "companion:dashboard",
  context: "companion:context",
} as const;

const defaultContext: UserContext = {
  stressLevel: "medium",
  energyLevel: "medium",
  mode: "balanced",
};

function defaultDashboard(): DashboardSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      todayFocus: "Welcome to Companion! Set your context below.",
      pendingDeadlines: 0,
      activeAgents: 0,
      journalStreak: 0,
    },
    agentStates: [
      { name: "notes", status: "idle", lastRunAt: null },
      { name: "lecture-plan", status: "idle", lastRunAt: null },
      { name: "assignment-tracker", status: "idle", lastRunAt: null },
      { name: "orchestrator", status: "idle", lastRunAt: null },
    ],
    notifications: [],
    events: [],
  };
}

export function loadDashboard(): DashboardSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.dashboard);
    if (raw) return JSON.parse(raw) as DashboardSnapshot;
  } catch {
    // corrupted — fall through
  }
  return defaultDashboard();
}

export function saveDashboard(snapshot: DashboardSnapshot): void {
  localStorage.setItem(STORAGE_KEYS.dashboard, JSON.stringify(snapshot));
}

export function loadContext(): UserContext {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.context);
    if (raw) return JSON.parse(raw) as UserContext;
  } catch {
    // corrupted — fall through
  }
  return defaultContext;
}

export function saveContext(ctx: UserContext): void {
  localStorage.setItem(STORAGE_KEYS.context, JSON.stringify(ctx));
}
