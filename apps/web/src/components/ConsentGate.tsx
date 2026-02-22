import { useCallback, useEffect, useState } from "react";
import { acceptConsent, getConsentStatus, type ConsentStatusResponse } from "../lib/api";

interface ConsentGateProps {
  onAccepted: () => void;
}

type ViewMode = "overview" | "tos" | "privacy";

export function ConsentGate({ onAccepted }: ConsentGateProps): JSX.Element {
  const [consent, setConsent] = useState<ConsentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("overview");
  const [readTos, setReadTos] = useState(false);
  const [readPrivacy, setReadPrivacy] = useState(false);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const status = await getConsentStatus();
        if (disposed) return;
        setConsent(status);
        if (!status.needsConsent) {
          onAccepted();
        }
      } catch {
        // If consent endpoint fails (e.g., older server), let user through
        if (!disposed) onAccepted();
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => { disposed = true; };
  }, [onAccepted]);

  const handleAccept = useCallback(async () => {
    if (!consent) return;
    setSubmitting(true);
    setError(null);
    try {
      await acceptConsent(consent.currentTosVersion, consent.currentPrivacyVersion);
      onAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [consent, onAccepted]);

  if (loading) {
    return (
      <main className="app-shell">
        <section className="consent-gate">
          <div className="consent-card">
            <p className="consent-loading">Loading…</p>
          </div>
        </section>
      </main>
    );
  }

  if (!consent || !consent.needsConsent) {
    return <></>;
  }

  if (view === "tos") {
    return (
      <main className="app-shell">
        <section className="consent-gate">
          <div className="consent-card consent-card-document">
            <button type="button" className="consent-back-btn" onClick={() => { setReadTos(true); setView("overview"); }}>
              ← Back
            </button>
            <TermsOfService />
          </div>
        </section>
      </main>
    );
  }

  if (view === "privacy") {
    return (
      <main className="app-shell">
        <section className="consent-gate">
          <div className="consent-card consent-card-document">
            <button type="button" className="consent-back-btn" onClick={() => { setReadPrivacy(true); setView("overview"); }}>
              ← Back
            </button>
            <PrivacyPolicy />
          </div>
        </section>
      </main>
    );
  }

  const canAccept = readTos && readPrivacy;

  return (
    <main className="app-shell">
      <section className="consent-gate">
        <div className="consent-card">
          <div className="consent-brand">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            <h2>Welcome to Companion</h2>
          </div>

          <p className="consent-intro">
            Before you continue, please review and accept our Terms of Service and Privacy Policy.
            We take your privacy seriously — your data is processed in accordance with the GDPR (EEA).
          </p>

          <div className="consent-links">
            <button
              type="button"
              className={`consent-link-btn ${readTos ? "consent-link-read" : ""}`}
              onClick={() => setView("tos")}
            >
              <span className="consent-link-icon">{readTos ? "✓" : "📄"}</span>
              <span>Terms of Service</span>
              <span className="consent-link-arrow">→</span>
            </button>
            <button
              type="button"
              className={`consent-link-btn ${readPrivacy ? "consent-link-read" : ""}`}
              onClick={() => setView("privacy")}
            >
              <span className="consent-link-icon">{readPrivacy ? "✓" : "🔒"}</span>
              <span>Privacy Policy</span>
              <span className="consent-link-arrow">→</span>
            </button>
          </div>

          {!canAccept && (
            <p className="consent-hint">Please read both documents before accepting.</p>
          )}

          {error && <p className="consent-error">{error}</p>}

          <button
            type="button"
            className="consent-accept-btn"
            onClick={() => void handleAccept()}
            disabled={!canAccept || submitting}
          >
            {submitting ? "Accepting…" : "I Accept"}
          </button>
        </div>
      </section>
    </main>
  );
}

// ── Legal Documents ──

function TermsOfService(): JSX.Element {
  return (
    <div className="legal-document">
      <h2>Terms of Service</h2>
      <p className="legal-meta">Effective date: February 22, 2026 · Version 1.0</p>

      <h3>1. Introduction</h3>
      <p>
        These Terms of Service ("Terms") govern your use of Companion ("the Service"),
        a personal AI assistant for university students, operated by Invaron AS,
        a Norwegian company ("we", "us", "our").
      </p>
      <p>
        By creating an account or using the Service, you agree to these Terms.
        If you do not agree, do not use the Service.
      </p>

      <h3>2. Description of Service</h3>
      <p>
        Companion is a mobile-first progressive web application that integrates with
        third-party services (Canvas LMS, Google Calendar, GitHub, Gmail, Withings, and others)
        to provide an AI-powered academic assistant. The AI component is powered by Google Gemini.
      </p>

      <h3>3. Eligibility</h3>
      <p>
        You must be at least 16 years old to use the Service. By using the Service, you represent
        that you meet this age requirement.
      </p>

      <h3>4. Your Account</h3>
      <p>
        You are responsible for maintaining the security of your account credentials.
        You must not share your account or allow others to access your account.
        You are responsible for all activity under your account.
      </p>

      <h3>5. Acceptable Use</h3>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful purpose</li>
        <li>Attempt to gain unauthorized access to other users' data</li>
        <li>Interfere with or disrupt the Service's infrastructure</li>
        <li>Reverse-engineer any part of the Service</li>
        <li>Use the Service to generate harmful, abusive, or misleading content</li>
      </ul>

      <h3>6. AI-Generated Content</h3>
      <p>
        The Service uses AI to provide responses, summaries, and recommendations.
        AI outputs may be inaccurate, incomplete, or outdated. You should independently verify
        important information, particularly academic deadlines and grading requirements.
        We are not liable for decisions made based on AI-generated content.
      </p>

      <h3>7. Third-Party Integrations</h3>
      <p>
        The Service connects to third-party platforms (Canvas LMS, Google, GitHub, etc.) on your behalf.
        Your use of those platforms is governed by their respective terms of service.
        We are not responsible for the availability or accuracy of third-party data.
      </p>

      <h3>8. Subscription &amp; Payments</h3>
      <p>
        Some features may require a paid subscription. Payment processing is handled by
        Stripe and/or Vipps. Subscription terms and pricing are displayed at the time of purchase.
        You may cancel at any time; access continues until the end of the billing period.
      </p>

      <h3>9. Limitation of Liability</h3>
      <p>
        The Service is provided "as is" without warranties of any kind. To the maximum extent
        permitted by Norwegian law, Invaron AS shall not be liable for indirect, incidental,
        or consequential damages arising from your use of the Service.
      </p>

      <h3>10. Termination</h3>
      <p>
        We may suspend or terminate your account if you violate these Terms.
        You may delete your account and all associated data at any time from Settings.
      </p>

      <h3>11. Changes to Terms</h3>
      <p>
        We may update these Terms from time to time. If we make material changes, you will be
        prompted to review and accept the new terms before continuing to use the Service.
      </p>

      <h3>12. Governing Law</h3>
      <p>
        These Terms are governed by the laws of Norway. Any disputes shall be resolved by the
        courts of Stavanger, Norway.
      </p>

      <h3>13. Contact</h3>
      <p>
        For questions about these Terms, contact us at: <strong>support@invaron.no</strong>
      </p>
    </div>
  );
}

function PrivacyPolicy(): JSX.Element {
  return (
    <div className="legal-document">
      <h2>Privacy Policy</h2>
      <p className="legal-meta">Effective date: February 22, 2026 · Version 1.0</p>

      <h3>1. Data Controller</h3>
      <p>
        Invaron AS (org.nr. pending), Stavanger, Norway, is the data controller for
        personal data processed through Companion ("the Service"). This policy is
        governed by the General Data Protection Regulation (GDPR) as implemented in Norway
        through the EEA Agreement.
      </p>

      <h3>2. What Data We Collect</h3>
      <p>We collect and process the following categories of personal data:</p>
      <table className="legal-table">
        <thead>
          <tr><th>Category</th><th>Examples</th><th>Legal Basis</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Account data</td>
            <td>Email, name, profile picture, authentication provider</td>
            <td>Contract performance (Art. 6(1)(b))</td>
          </tr>
          <tr>
            <td>Chat messages</td>
            <td>Conversations with the AI assistant, long-term memory entries</td>
            <td>Contract performance (Art. 6(1)(b))</td>
          </tr>
          <tr>
            <td>Academic data</td>
            <td>Course schedules, deadlines, grades, assignments (from Canvas LMS, TP EduCloud)</td>
            <td>Consent (Art. 6(1)(a))</td>
          </tr>
          <tr>
            <td>Productivity data</td>
            <td>Habits, goals, study plans, journal entries, nutrition logs</td>
            <td>Contract performance (Art. 6(1)(b))</td>
          </tr>
          <tr>
            <td>Integration data</td>
            <td>GitHub course repos, Gmail message metadata, Withings health metrics</td>
            <td>Consent (Art. 6(1)(a))</td>
          </tr>
          <tr>
            <td>Usage data</td>
            <td>Feature usage, notification interactions, push subscription info</td>
            <td>Legitimate interest (Art. 6(1)(f))</td>
          </tr>
        </tbody>
      </table>

      <h3>3. How We Use Your Data</h3>
      <ul>
        <li>To provide the core Service: AI conversations, schedule management, deadline tracking</li>
        <li>To personalize AI responses with your academic and personal context</li>
        <li>To sync data from connected third-party services on your behalf</li>
        <li>To send notifications (push, email digests) about deadlines and reminders</li>
        <li>To improve the Service through aggregated, anonymized analytics</li>
      </ul>

      <h3>4. Third-Party Processors</h3>
      <p>We share data with the following processors to provide the Service:</p>
      <table className="legal-table">
        <thead>
          <tr><th>Processor</th><th>Purpose</th><th>Data Shared</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Google (Vertex AI / Gemini)</td>
            <td>AI conversation processing</td>
            <td>Chat messages, academic context sent per-request</td>
          </tr>
          <tr>
            <td>Railway</td>
            <td>Server hosting</td>
            <td>All data processed by the backend</td>
          </tr>
          <tr>
            <td>Stripe / Vipps</td>
            <td>Payment processing</td>
            <td>Email, subscription status (no card details stored by us)</td>
          </tr>
          <tr>
            <td>GitHub Pages</td>
            <td>Frontend hosting</td>
            <td>Static files only (no personal data)</td>
          </tr>
        </tbody>
      </table>

      <h3>5. Data Retention</h3>
      <p>
        Your data is retained for as long as your account exists. When you delete your account,
        all personal data is permanently deleted from our systems immediately. We do not retain
        backups of individual user data after deletion.
      </p>

      <h3>6. Your Rights (GDPR)</h3>
      <p>Under the GDPR, you have the right to:</p>
      <ul>
        <li><strong>Access</strong> – Request a copy of your personal data</li>
        <li><strong>Rectification</strong> – Correct inaccurate data</li>
        <li><strong>Erasure</strong> – Delete your account and all data ("right to be forgotten")</li>
        <li><strong>Data portability</strong> – Receive your data in a structured format</li>
        <li><strong>Restrict processing</strong> – Limit how we process your data</li>
        <li><strong>Object</strong> – Object to processing based on legitimate interest</li>
        <li><strong>Withdraw consent</strong> – Disconnect any integration at any time</li>
      </ul>
      <p>
        You can exercise your right to erasure directly in the app (Settings → Delete Account).
        For other requests, contact us at <strong>privacy@invaron.no</strong>.
      </p>

      <h3>7. Data Security</h3>
      <p>
        We implement appropriate technical and organisational measures to protect your data,
        including encrypted API tokens for third-party connections, session-based authentication,
        and HTTPS for all data transmission.
      </p>

      <h3>8. International Transfers</h3>
      <p>
        Your data may be processed by Google (Vertex AI) in the EU/EEA region.
        Where data is transferred outside the EEA, we rely on Standard Contractual Clauses
        or adequacy decisions as appropriate.
      </p>

      <h3>9. Cookies &amp; Local Storage</h3>
      <p>
        The Service uses browser localStorage to store your authentication token, UI preferences
        (theme, mood), and cached data for offline functionality. We do not use tracking cookies
        or third-party analytics cookies. All locally stored data is essential for the Service to function.
      </p>

      <h3>10. Children</h3>
      <p>
        The Service is not intended for children under 16. We do not knowingly collect personal
        data from children under 16.
      </p>

      <h3>11. Changes to This Policy</h3>
      <p>
        We may update this Privacy Policy from time to time. If we make material changes,
        you will be prompted to review the updated policy before continuing to use the Service.
      </p>

      <h3>12. Supervisory Authority</h3>
      <p>
        If you believe we are processing your data unlawfully, you have the right to lodge a
        complaint with Datatilsynet (the Norwegian Data Protection Authority):
        <br />
        <a href="https://www.datatilsynet.no" target="_blank" rel="noopener noreferrer">www.datatilsynet.no</a>
      </p>

      <h3>13. Contact</h3>
      <p>
        For privacy inquiries: <strong>privacy@invaron.no</strong>
        <br />
        Invaron AS · Stavanger, Norway
      </p>
    </div>
  );
}
