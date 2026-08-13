import { Badge } from "@/components/ui/Badge";
import { timeAgo, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface CellValueProps {
  value: unknown;
  fieldKey: string;
}

// Heuristic: if a number looks like a timestamp (13 digits, between 2020 and 2030)
function isTimestamp(value: unknown): value is number {
  if (typeof value !== "number") return false;
  return value > 1577836800000 && value < 1893456000000; // 2020-2030
}

export function CellValue({ value, fieldKey }: CellValueProps) {
  // Null / undefined
  if (value === null || value === undefined) {
    return <span className="text-ink-faint">—</span>;
  }

  // Boolean
  if (typeof value === "boolean") {
    return (
      <Badge variant={value ? "success" : "danger"}>
        {value ? "true" : "false"}
      </Badge>
    );
  }

  // Timestamps (creation time fields or heuristic)
  if (
    isTimestamp(value) &&
    (fieldKey.includes("At") ||
      fieldKey.includes("Time") ||
      fieldKey.includes("Date") ||
      fieldKey === "expiresAt")
  ) {
    return (
      <span className="text-ink-muted" title={formatDateTime(value as number)}>
        {timeAgo(value as number)}
      </span>
    );
  }

  // _id fields
  if (fieldKey === "_id" || fieldKey.endsWith("Id")) {
    const str = String(value);
    return (
      <span
        className="max-w-[120px] truncate font-mono text-xs text-ink-subtle"
        title={str}
      >
        {str.length > 16 ? `${str.slice(0, 8)}...${str.slice(-4)}` : str}
      </span>
    );
  }

  // Array
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-ink-faint">[]</span>;
    }
    // If it's an array of strings, show as comma-separated badges
    if (value.every((v) => typeof v === "string") && value.length <= 3) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((v, i) => (
            <Badge key={i} variant="default">
              {v}
            </Badge>
          ))}
        </div>
      );
    }
    return <Badge variant="info">{value.length} items</Badge>;
  }

  // Object
  if (typeof value === "object") {
    return (
      <span className="text-ink-subtle" title={JSON.stringify(value, null, 2)}>
        {"{...}"}
      </span>
    );
  }

  // Number
  if (typeof value === "number") {
    return <span>{value.toLocaleString()}</span>;
  }

  // String (default)
  const str = String(value);
  return (
    <span
      className={cn("max-w-[200px] truncate", str.length > 50 && "cursor-help")}
      title={str.length > 30 ? str : undefined}
    >
      {str}
    </span>
  );
}
