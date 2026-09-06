import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.jsx";
import { I18nProvider } from "./i18n/I18nProvider.jsx";
import { AuthProvider } from "./features/auth/AuthProvider.jsx";
import "./tokens.css";
import "./styles.css";
import "./features/auth/auth.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nProvider>
  </React.StrictMode>,
);
