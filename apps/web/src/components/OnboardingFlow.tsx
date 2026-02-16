import { useState } from "react";
import { OnboardingProfile } from "../types";
import { enrollBiometric, supportsBiometric } from "../lib/biometric";
import { saveBiometricCredential } from "../lib/storage";

interface OnboardingFlowProps {
  onComplete: (profile: OnboardingProfile) => void;
}

const tones: Array<OnboardingProfile["nudgeTone"]> = ["gentle", "balanced", "direct"];

export function OnboardingFlow({ onComplete }: OnboardingFlowProps): JSX.Element {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [baselineSchedule, setBaselineSchedule] = useState("");
  const [nudgeTone, setNudgeTone] = useState<OnboardingProfile["nudgeTone"]>("balanced");
  const [enableBiometric, setEnableBiometric] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState("");

  const biometricSupported = supportsBiometric();

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();

    if (!name.trim() || !timezone.trim() || !baselineSchedule.trim()) {
      return;
    }

    // If user wants biometric, enroll first
    if (enableBiometric && biometricSupported) {
      setIsEnrolling(true);
      setEnrollmentError("");

      const result = await enrollBiometric(name.trim());
      
      if (result.success) {
        saveBiometricCredential(result.credential);
      } else {
        setEnrollmentError(result.error);
        setIsEnrolling(false);
        return;
      }
    }

    onComplete({
      name: name.trim(),
      timezone: timezone.trim(),
      baselineSchedule: baselineSchedule.trim(),
      nudgeTone,
      completedAt: new Date().toISOString()
    });
  };

  return (
    <section className="panel onboarding-panel">
      <header className="panel-header">
        <h2>Welcome to Companion</h2>
      </header>
      <p>Let&apos;s set up your profile so nudges fit your daily routine on iPhone.</p>
      <form className="journal-input-form" onSubmit={(e) => void handleSubmit(e)}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Lucy" />
        </label>

        <label>
          Timezone
          <input
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="Europe/Copenhagen"
          />
        </label>

        <label>
          Baseline schedule
          <textarea
            value={baselineSchedule}
            onChange={(event) => setBaselineSchedule(event.target.value)}
            rows={3}
            placeholder="Classes Mon–Fri 9-15, gym Tue/Thu 17:00"
          />
        </label>

        <label>
          Preferred nudge tone
          <select value={nudgeTone} onChange={(event) => setNudgeTone(event.target.value as OnboardingProfile["nudgeTone"])}>
            {tones.map((tone) => (
              <option key={tone} value={tone}>
                {tone}
              </option>
            ))}
          </select>
        </label>

        {biometricSupported && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={enableBiometric}
              onChange={(event) => setEnableBiometric(event.target.checked)}
            />
            <span>Enable Face ID / Touch ID to protect your journal</span>
          </label>
        )}

        {enrollmentError && (
          <p className="error">{enrollmentError}</p>
        )}

        <button 
          type="submit" 
          disabled={!name.trim() || !timezone.trim() || !baselineSchedule.trim() || isEnrolling}
        >
          {isEnrolling ? "Setting up Face ID..." : "Start using Companion"}
        </button>
      </form>
    </section>
  );
}
