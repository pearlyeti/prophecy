import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
  readonly info: ErrorInfo | null;
}

// Minimal error boundary so a render-time crash shows the error
// instead of unmounting the tree to a blank page. Replace with a
// fancier surface (Sentry, retry) when we wire observability.
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info);
    this.setState({ info });
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="min-h-dvh px-6 py-10">
          <h1 className="text-2xl font-semibold text-red-300">Something broke during render.</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Open DevTools console for the full stack. The page can be reloaded after copying the error.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-red-900 bg-red-950/30 p-4 text-xs text-red-200">
            {this.state.error.message}
            {'\n'}
            {this.state.error.stack}
          </pre>
          {this.state.info && (
            <pre className="mt-4 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-[11px] text-neutral-400">
              {this.state.info.componentStack}
            </pre>
          )}
          <button
            type="button"
            onClick={() => location.reload()}
            className="mt-6 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:border-neutral-500"
          >
            Reload
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
