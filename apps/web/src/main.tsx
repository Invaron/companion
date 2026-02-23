import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./lib/i18n";
import { applyTheme } from "./lib/theme";
import { loadThemePreference } from "./lib/storage";
import "./index.css";

applyTheme(loadThemePreference());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
