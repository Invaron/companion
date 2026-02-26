import { useCallback, useEffect, useRef, useState } from "react";

interface OnboardingFlowProps {
  onComplete: () => void;
}

const SCREENS = [
  {
    illustration: "/onboarding/onboarding-welcome.svg",
    title: "Hey! I\u2019m your AI companion\u00a0for\u00a0university.",
    subtitle: "I know your schedule, deadlines, and goals \u2014 ask me anything.",
  },
  {
    illustration: "/onboarding/onboarding-schedule.svg",
    title: "Your lectures, deadlines,\u00a0and\u00a0exams.",
    subtitle: "Synced from Canvas & your calendar, always up to date.",
  },
  {
    illustration: "/onboarding/onboarding-chat.svg",
    title: "Ask anything, plan\u00a0your\u00a0week, or\u00a0just\u00a0vent.",
    subtitle: "Powered by Gemini with full context about your academic life.",
  },
  {
    illustration: "/onboarding/onboarding-confetti.svg",
    title: "You\u2019re all set!",
    subtitle: "Let\u2019s make this semester your best one yet.",
    cta: true,
  },
];

const BASE_PATH = import.meta.env.BASE_URL ?? "/";

export function OnboardingFlow({ onComplete }: OnboardingFlowProps): JSX.Element {
  const [currentScreen, setCurrentScreen] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isLastScreen = currentScreen === SCREENS.length - 1;

  // Track scroll position for dot indicators
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = (): void => {
      const scrollLeft = container.scrollLeft;
      const width = container.clientWidth;
      const index = Math.round(scrollLeft / width);
      setCurrentScreen(Math.min(index, SCREENS.length - 1));
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToScreen = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ left: index * container.clientWidth, behavior: "smooth" });
  }, []);

  const handleNext = useCallback(() => {
    if (isLastScreen) {
      localStorage.setItem("onboarding-done", "1");
      onComplete();
    } else {
      scrollToScreen(currentScreen + 1);
    }
  }, [isLastScreen, currentScreen, onComplete, scrollToScreen]);

  const handleSkip = useCallback(() => {
    localStorage.setItem("onboarding-done", "1");
    onComplete();
  }, [onComplete]);

  return (
    <div className="onboarding-root">
      {/* Skip button (visible on all screens except last) */}
      {!isLastScreen && (
        <button type="button" className="onboarding-skip" onClick={handleSkip}>
          Skip
        </button>
      )}

      {/* Swipeable screens */}
      <div ref={containerRef} className="onboarding-container">
        {SCREENS.map((screen, i) => (
          <div key={i} className="onboarding-screen">
            <div className="onboarding-illustration">
              <img
                src={`${BASE_PATH}onboarding/${screen.illustration.split("/").pop()}`}
                alt=""
                width="280"
                height="280"
                loading={i === 0 ? "eager" : "lazy"}
              />
            </div>
            <h1 className="onboarding-title">{screen.title}</h1>
            <p className="onboarding-subtitle">{screen.subtitle}</p>
          </div>
        ))}
      </div>

      {/* Bottom area: dots + button */}
      <div className="onboarding-footer">
        <div className="onboarding-dots">
          {SCREENS.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`onboarding-dot ${i === currentScreen ? "onboarding-dot-active" : ""}`}
              onClick={() => scrollToScreen(i)}
              aria-label={`Go to screen ${i + 1}`}
            />
          ))}
        </div>
        <button
          type="button"
          className={`onboarding-cta ${isLastScreen ? "onboarding-cta-primary" : ""}`}
          onClick={handleNext}
        >
          {isLastScreen ? "Get Started" : "Next"}
        </button>
      </div>
    </div>
  );
}
