import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';

type Props = { children: ReactNode; title?: string };
type State = { error: Error | null };

/**
 * Route-level error boundary. A rendering failure inside one screen must not blank the shell,
 * so App.tsx wraps the outlet and keeps the navigation usable.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto w-full max-w-content p-8">
        <ErrorState
          title={this.props.title ?? 'This screen failed to render'}
          message={error.message}
          onRetry={() => this.setState({ error: null })}
        />
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" onClick={() => window.location.assign('/')}>
            Back to home
          </Button>
        </div>
      </div>
    );
  }
}
