import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { listenForErrors } from "./lib/reportError";
import "./styles.css";
// Listen for the install prompt from the start: it fires once, early.
import "./lib/install";

listenForErrors();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
