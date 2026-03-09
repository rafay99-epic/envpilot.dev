export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <span className="font-mono text-sm text-green-400">
        <span className="text-zinc-500">$</span> loading
        <span
          className="inline-block w-2 bg-green-400"
          style={{ animation: "blink 1s step-end infinite" }}
        >
          &nbsp;
        </span>
      </span>
    </div>
  );
}
