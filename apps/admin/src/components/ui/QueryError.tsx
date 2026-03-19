import { AlertCircle, RefreshCw } from "lucide-react";
import { Card } from "./Card";

interface QueryErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function QueryError({
  title = "Failed to load data",
  message = "There was an error loading this section. Please try again.",
  onRetry,
}: QueryErrorProps) {
  return (
    <Card className="flex flex-col items-center gap-4 py-12 text-center">
      <AlertCircle className="h-10 w-10 text-red-400" />
      <div>
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        <p className="mt-1 max-w-md text-sm text-zinc-500">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      )}
    </Card>
  );
}
