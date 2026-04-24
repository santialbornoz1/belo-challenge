import { useState } from "react";
import { Modal } from "./Modal";
import { TestCases } from "./TestCases";
import { RequestLog } from "./RequestLog";

type SubTab = "tests" | "log";

export function QaPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<SubTab>("tests");

  return (
    <Modal title="Modo QA — herramientas técnicas" onClose={onClose} size="lg">
      <p className="text-xs text-slate-400 mb-4">
        Herramientas para QA y desarrollo. <b>Casos automáticos</b> corre los 23 tests
        contra el backend creando sus propios datos. <b>Request log</b> muestra todos los
        requests que la app hizo (UI + tests).
      </p>

      <div className="flex gap-1 mb-4 border-b border-slate-800">
        {(
          [
            { id: "tests", label: "Casos automáticos" },
            { id: "log", label: "Request log" },
          ] as { id: SubTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition ${
              tab === t.id
                ? "border-emerald-400 text-emerald-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "tests" && <TestCases />}
      {tab === "log" && <RequestLog />}
    </Modal>
  );
}
