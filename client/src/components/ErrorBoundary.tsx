import { cn } from "@/lib/utils";
import {
  attemptChunkReload,
  forceChunkReload,
  isChunkLoadError,
} from "@/lib/chunkRecovery";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (attemptChunkReload(error)) {
      return;
    }

    console.error("[ErrorBoundary] Unhandled React error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isChunkError = isChunkLoadError(this.state.error);

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">
              {isChunkError ? "TruckFixr updated while this tab was open." : "An unexpected error occurred."}
            </h2>

            <p className="mb-6 max-w-xl text-center text-sm text-muted-foreground">
              {isChunkError
                ? "TruckFixr already tried to refresh this route once. Load the latest version again to clear any stale files left in this browser tab."
                : "Reload the page to try again. If it keeps happening, the error details below will help us trace it."}
            </p>

            {!isChunkError ? (
              <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
                <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                  {this.state.error?.stack}
                </pre>
              </div>
            ) : null}

            <button
              onClick={() => {
                if (isChunkError) {
                  forceChunkReload();
                  return;
                }

                window.location.reload();
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              {isChunkError ? "Load Latest Version" : "Reload Page"}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
