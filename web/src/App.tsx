import { useEffect, useState } from "react";
import { api } from "./api";
import { AppProvider, useApp } from "./state";
import { Login } from "./components/Login";
import { Home } from "./components/Home";
import { SendMoney } from "./components/SendMoney";
import { Admin } from "./components/Admin";
import { TxDetail } from "./components/TxDetail";
import { QaPanel } from "./components/QaPanel";
import type { Transaction } from "./types";

type Overlay = null | "send" | "admin" | "qa" | { kind: "tx"; tx: Transaction };

function HealthBadge() {
  const [status, setStatus] = useState<"checking" | "ok" | "down">("checking");
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const res = await api.health();
      if (!alive) return;
      setStatus(res.ok ? "ok" : "down");
    };
    void check();
    const interval = setInterval(check, 15_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);
  const color =
    status === "ok"
      ? "bg-emerald-500"
      : status === "down"
        ? "bg-red-500"
        : "bg-amber-500";
  const label =
    status === "ok"
      ? "conectado"
      : status === "down"
        ? "sin conexión"
        : "conectando";
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function Shell() {
  const { currentUser } = useApp();
  const [overlay, setOverlay] = useState<Overlay>(null);

  const openTx = (tx: Transaction) => setOverlay({ kind: "tx", tx });

  return (
    <div className="min-h-full flex flex-col">
      <main className="flex-1">
        {!currentUser && <Login />}
        {currentUser && (
          <Home
            onSend={() => setOverlay("send")}
            onOpenAdmin={() => setOverlay("admin")}
            onOpenTx={openTx}
          />
        )}
      </main>

      <footer className="border-t border-slate-800/60 px-5 py-2.5 flex items-center justify-between text-[11px] text-slate-500">
        <span>Belo Lite · demo</span>
        <div className="flex items-center gap-3">
          <HealthBadge />
          <span className="text-slate-600">·</span>
          <button
            onClick={() => setOverlay("qa")}
            className="hover:text-slate-300 underline underline-offset-2 decoration-dotted"
          >
            Modo QA
          </button>
        </div>
      </footer>

      {overlay === "send" && currentUser && (
        <SendMoney onClose={() => setOverlay(null)} onViewTx={openTx} />
      )}
      {overlay === "admin" && currentUser && (
        <Admin onClose={() => setOverlay(null)} onViewTx={openTx} />
      )}
      {overlay === "qa" && <QaPanel onClose={() => setOverlay(null)} />}
      {overlay && typeof overlay === "object" && overlay.kind === "tx" && (
        <TxDetail tx={overlay.tx} onClose={() => setOverlay(null)} />
      )}
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
