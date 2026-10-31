import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { registerServiceWorker } from "./lib/push";
import { rememberRef } from "./lib/ref";
import { listenForErrors } from "./lib/reportError";
import "./styles.css";
// Listen for the install prompt from the start: it fires once, early.
import "./lib/install";

listenForErrors();
rememberRef();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
