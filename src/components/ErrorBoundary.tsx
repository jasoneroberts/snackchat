import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "../lib/reportError";

/**
 * If any part of the app crashes while drawing the screen, show a friendly
 * "reload" page instead of a blank white one, and tell the server.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, info.componentStack ?? undefined);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="app">
        <main className="page stack crash">
          <img src="/logo.svg" alt="" width={64} height={64} />
          <h1>Something went wrong</h1>
          <p className="muted">Sorry, that screen crashed. We've been told about it. Reloading usually fixes it.</p>
          <button type="button" className="button" onClick={() => location.reload()}>
            Reload
          </button>
          <button type="button" className="link-button" onClick={() => location.assign("/")}>
            Back to the start
          </button>
        </main>
      </div>
    );
  }
}
