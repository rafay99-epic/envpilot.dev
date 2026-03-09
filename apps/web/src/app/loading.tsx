export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a]">
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
