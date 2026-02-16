type HapticType = "success" | "notice" | "alert";

const PATTERNS: Record<HapticType, number | number[]> = {
  success: [12, 20, 12],
  notice: [25, 20, 25],
  alert: [90, 60, 90]
};

const canVibrate = (): boolean => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

const vibrate = (pattern: number | number[]): boolean => {
  if (!canVibrate()) {
    return false;
  }

  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
};

export const hapticSuccess = (): void => {
  void vibrate(PATTERNS.success);
};

export const hapticNotice = (): void => {
  void vibrate(PATTERNS.notice);
};

export const hapticCriticalAlert = (): void => {
  void vibrate(PATTERNS.alert);
};
