import type { ReactNode } from "react";
import { terminal } from "./tokens";

export interface TerminalColumn {
  key: string;
  label: string;
  align?: "left" | "center";
}

export interface TerminalRow {
  key: string;
  cells: ReactNode[];
}

export function TerminalTable({
  columns,
  rows,
  minWidth = 720,
}: {
  columns: TerminalColumn[];
  rows: TerminalRow[];
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        style={{ minWidth }}
        className={`w-full ${terminal.mono} text-[12.5px] whitespace-nowrap`}
      >
        <thead>
          <tr className={`border-b ${terminal.line}`}>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`py-3 font-normal ${
                  column.align === "center"
                    ? "px-3 text-center text-ink-muted"
                    : "px-5 text-left tracking-[0.14em] text-ink-faint uppercase"
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.key} className="hover:bg-white/[0.02]">
              {row.cells.map((cell, i) => (
                <td
                  key={columns[i]?.key ?? i}
                  className={`py-2.5 ${
                    columns[i]?.align === "center"
                      ? "px-3 text-center"
                      : "px-5 text-left"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
