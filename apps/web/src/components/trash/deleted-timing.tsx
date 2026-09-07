import { daysAgo, daysLeft, pluralDays } from "./retention";

// "Deleted N days ago — N days left", shared by every trash row.
export function DeletedTiming({
  deletedAt,
  now,
}: {
  deletedAt: number;
  now: number;
}) {
  return (
    <p className="mt-1 text-xs text-ink-subtle">
      Deleted {pluralDays(daysAgo(deletedAt, now))} ago
      {" — "}
      <span
        className={
          daysLeft(deletedAt, now) <= 1 ? "font-medium text-danger" : ""
        }
      >
        {pluralDays(daysLeft(deletedAt, now))} left
      </span>
    </p>
  );
}
