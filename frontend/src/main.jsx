import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.jsx";
import { I18nProvider } from "./i18n/I18nProvider.jsx";
import { DemoRuntimeProvider } from "./features/runtime/DemoRuntimeProvider.jsx";
import "./tokens.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <DemoRuntimeProvider>
        <App />
      </DemoRuntimeProvider>
    </I18nProvider>
  </React.StrictMode>,
);
