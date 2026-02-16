import { useState } from "react";
import { enrollBiometric, supportsBiometric, disableBiometric } from "../lib/biometric";
import { loadBiometricCredential, saveBiometricCredential, removeBiometricCredential, loadOnboardingProfile } from "../lib/storage";

export function BiometricSettings(): JSX.Element {
  const [credential, setCredential] = useState(loadBiometricCredential());
  const [enrolling, setEnrolling] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const profile = loadOnboardingProfile();
  const biometricSupported = supportsBiometric();

  if (!biometricSupported) {
    return (
      <section className="panel">
        <header className="panel-header">
          <h2>Biometric Authentication</h2>
        </header>
        <div className="settings-stack">
          <p style={{ color: "var(--muted)" }}>
            Face ID / Touch ID authentication is not supported on this device.
          </p>
        </div>
      </section>
    );
  }

  const handleEnroll = async (): Promise<void> => {
    if (!profile) {
      setErrorMessage("Profile not found. Please complete onboarding first.");
      return;
    }

    setEnrolling(true);
    setErrorMessage("");
    setSuccessMessage("");

    const result = await enrollBiometric(profile.name);

    if (result.success) {
      saveBiometricCredential(result.credential);
      setCredential(result.credential);
      setSuccessMessage("Biometric authentication enabled successfully!");
    } else {
      setErrorMessage(result.error);
    }

    setEnrolling(false);
  };

  const handleDisable = (): void => {
    disableBiometric();
    removeBiometricCredential();
    setCredential(null);
    setSuccessMessage("Biometric authentication disabled.");
    setErrorMessage("");
  };

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Biometric Authentication</h2>
      </header>
      <div className="settings-stack">
        {credential ? (
          <>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              ✓ Face ID / Touch ID is enabled for this device.
            </p>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0.5rem 0 0" }}>
              Enrolled: {new Date(credential.enrolledAt).toLocaleDateString()}
            </p>
            <button
              type="button"
              onClick={handleDisable}
              style={{ 
                marginTop: "1rem",
                padding: "0.5rem 1rem",
                background: "var(--error, #ef4444)",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
                cursor: "pointer"
              }}
            >
              Disable Face ID / Touch ID
            </button>
          </>
        ) : (
          <>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Protect your journal and data with Face ID or Touch ID authentication.
            </p>
            <button
              type="button"
              onClick={() => void handleEnroll()}
              disabled={enrolling}
              style={{ 
                marginTop: "1rem",
                padding: "0.5rem 1rem",
                background: "var(--accent, #3b82f6)",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
                cursor: enrolling ? "not-allowed" : "pointer",
                opacity: enrolling ? 0.6 : 1
              }}
            >
              {enrolling ? "Enrolling..." : "Enable Face ID / Touch ID"}
            </button>
          </>
        )}

        {errorMessage && (
          <p className="error" style={{ marginTop: "1rem" }}>
            {errorMessage}
          </p>
        )}

        {successMessage && (
          <p style={{ marginTop: "1rem", color: "var(--success, #10b981)" }}>
            {successMessage}
          </p>
        )}

        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "1rem" }}>
          Note: Biometric credentials are stored locally on this device only.
          You&apos;ll need to re-enroll on each device you use.
        </p>
      </div>
    </section>
  );
}
