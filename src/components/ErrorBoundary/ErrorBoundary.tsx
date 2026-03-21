import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Nieobsluzony blad:', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleDismiss = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-slate-200 gap-6 p-8">
          <div className="text-red-400 text-4xl font-bold">Ups!</div>
          <div className="text-center max-w-md">
            <p className="text-lg mb-2">Wystapil nieoczekiwany blad w aplikacji.</p>
            <p className="text-sm text-slate-400">
              {this.state.error?.message ?? 'Nieznany blad'}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={this.handleReload}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors"
            >
              Odswierz aplikacje
            </button>
            <button
              onClick={this.handleDismiss}
              className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded font-medium transition-colors"
            >
              Sprobuj kontynuowac
            </button>
          </div>
          {this.state.error?.stack && (
            <details className="max-w-lg w-full">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
                Szczegoly techniczne
              </summary>
              <pre className="mt-2 p-3 bg-slate-800 rounded text-[10px] text-slate-400 overflow-auto max-h-48 font-mono">
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
