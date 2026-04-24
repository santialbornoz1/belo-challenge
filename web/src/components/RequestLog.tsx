import { useMemo, useState } from "react";
import { useApp } from "../state";
import type { LogEntry } from "../types";

export function RequestLog() {
  const { log, clearLog } = useApp();
  const [filter, setFilter] = useState<"all" | "errors" | "mutations">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "errors") return log.filter((e) => !e.ok);
    if (filter === "mutations")
      return log.filter((e) => e.method !== "GET");
    return log;
  }, [log, filter]);

  const stats = useMemo(() => {
    const total = log.length;
    const errors = log.filter((e) => !e.ok).length;
    const avg =
      log.length === 0
        ? 0
        : Math.round(log.reduce((s, e) => s + e.durationMs, 0) / log.length);
    return { total, errors, avg };
  }, [log]);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(["all", "errors", "mutations"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded border ${
                filter === f
                  ? "bg-emerald-600/30 border-emerald-500/40 text-emerald-200"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-400 ml-auto flex gap-4">
          <span>{stats.total} requests</span>
          <span className={stats.errors > 0 ? "text-red-400" : ""}>
            {stats.errors} errores
          </span>
          <span>avg {stats.avg}ms</span>
        </div>
        <button
          onClick={clearLog}
          className="text-xs px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded"
        >
          Clear
        </button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-lg divide-y divide-slate-800">
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-slate-500 text-sm">
            Aún no hay requests. Probá algo en Playground o corré los tests.
          </div>
        )}
        {filtered.map((entry) => (
          <LogRow
            key={entry.id}
            entry={entry}
            open={openId === entry.id}
            onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
          />
        ))}
      </div>
    </div>
  );
}

function LogRow({
  entry,
  open,
  onToggle,
}: {
  entry: LogEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const statusCls = entry.ok
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : entry.status === 0
      ? "bg-slate-700 text-slate-300 border-slate-600"
      : "bg-red-500/20 text-red-300 border-red-500/40";

  const time = new Date(entry.ts).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const path = entry.url.replace(/^https?:\/\/[^/]+/, "");

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-slate-800/40"
      >
        <span className="text-[10px] text-slate-500 font-mono w-16 shrink-0">{time}</span>
        <span className="text-[10px] font-mono uppercase w-14 shrink-0 text-slate-400">
          {entry.method}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono border w-14 text-center shrink-0 ${statusCls}`}
        >
          {entry.status || "ERR"}
        </span>
        <span className="text-xs font-mono text-slate-300 truncate flex-1">{path}</span>
        {entry.label && (
          <span className="text-[10px] text-slate-500 truncate max-w-[160px]">
            {entry.label}
          </span>
        )}
        <span className="text-[10px] text-slate-500 font-mono w-12 text-right shrink-0">
          {entry.durationMs}ms
        </span>
      </button>
      {open && (
        <div className="px-4 pb-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-1">Request</div>
            <pre className="text-[11px] font-mono text-slate-300 bg-slate-950 border border-slate-800 rounded p-2 max-h-64 overflow-auto">
              {JSON.stringify(
                {
                  headers: entry.requestHeaders,
                  body: entry.requestBody,
                },
                null,
                2,
              )}
            </pre>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-1">Response</div>
            <pre className="text-[11px] font-mono text-slate-300 bg-slate-950 border border-slate-800 rounded p-2 max-h-64 overflow-auto">
              {JSON.stringify(entry.responseBody, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
