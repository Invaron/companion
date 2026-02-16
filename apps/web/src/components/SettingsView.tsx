import { NotificationSettings } from "./NotificationSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { ContextControls } from "./ContextControls";
import { ThemePreference } from "../types";

interface SettingsViewProps {
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
  onUpdated: () => Promise<void>;
}

export function SettingsView({
  themePreference,
  onThemeChange,
  onUpdated
}: SettingsViewProps): JSX.Element {
  return (
    <div className="settings-container">
      <h2>Settings</h2>
      <ContextControls onUpdated={onUpdated} />
      <NotificationSettings />
      <AppearanceSettings preference={themePreference} onChange={onThemeChange} />
    </div>
  );
}
