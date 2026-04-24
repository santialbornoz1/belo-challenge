import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../state";
import type { ApiErrorBody, Transaction } from "../types";
import { avatarColor, formatARS, initials, timeAgo, translateError } from "../utils";
import { Modal } from "./Modal";

export function Admin({
  onClose,
  onViewTx,
}: {
  onClose: () => void;
  onViewTx: (tx: Transaction) => void;
}) {
  const { currentUser, appendLog, reloadCurrentUser, bumpTxVersion } = useApp();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    const res = await api.listTransactions(
      { status: "pending", limit: 100 },
      currentUser.id,
      appendLog,
    );
    if (res.ok && res.body && typeof res.body === "object" && "data" in res.body) {
      const body = res.body as { data: Transaction[] };
      setTxs(body.data);
    }
    setLoading(false);
  }, [currentUser, appendLog]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (tx: Transaction, action: "approve" | "reject") => {
    if (!currentUser) return;
    setBusyId(tx.id);
    setFlash(null);
    const res =
      action === "approve"
        ? await api.approveTransaction(tx.id, currentUser.id, appendLog)
        : await api.rejectTransaction(tx.id, currentUser.id, appendLog);
    setBusyId(null);
    if (res.ok) {
      setFlash(
        action === "approve"
          ? `Aprobaste la transferencia de ${tx.fromUser.name} a ${tx.toUser.name}`
          : `Rechazaste la transferencia de ${tx.fromUser.name} a ${tx.toUser.name}`,
      );
      void reloadCurrentUser();
      void load();
      bumpTxVersion();
    } else {
      const t = translateError((res.body as ApiErrorBody | null)?.error ?? null);
      setFlash(`${t.title}${t.detail ? ` — ${t.detail}` : ""}`);
    }
  };

  if (!currentUser) return null;

  return (
    <Modal title="Transferencias pendientes del sistema" onClose={onClose} size="lg">
      <p className="text-sm text-slate-400 mb-4">
        Revisá aquí las transferencias que requieren aprobación manual. Aprobalas para
        mover los saldos, o rechazalas para descartarlas.
      </p>

      {flash && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-200">
          {flash}
        </div>
      )}

      {loading && txs.length === 0 && (
        <div className="py-10 text-center text-slate-500 text-sm">Cargando…</div>
      )}

      {!loading && txs.length === 0 && (
        <div className="py-10 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-2xl">
            ✓
          </div>
          <div className="mt-3 font-medium">Nada para revisar</div>
          <div className="text-sm text-slate-500">
            No hay transferencias pendientes de aprobación.
          </div>
        </div>
      )}

      <ul className="space-y-3">
        {txs.map((tx) => (
          <li
            key={tx.id}
            className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden"
          >
            <button
              onClick={() => onViewTx(tx)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${avatarColor(tx.fromUser.id)}`}
              >
                {initials(tx.fromUser.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <span className="font-medium">{tx.fromUser.name}</span>{" "}
                  <span className="text-slate-400">quiere enviarle a</span>{" "}
                  <span className="font-medium">{tx.toUser.name}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {timeAgo(tx.createdAt)}
                </div>
              </div>
              <div className="font-mono text-amber-300">{formatARS(tx.amount)}</div>
            </button>
            <div className="border-t border-slate-800 px-4 py-2 flex gap-2 justify-end">
              <button
                disabled={busyId === tx.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void decide(tx, "reject");
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 border border-slate-700 hover:border-red-500/40 text-sm disabled:opacity-50"
              >
                Rechazar
              </button>
              <button
                disabled={busyId === tx.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void decide(tx, "approve");
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium disabled:opacity-50"
              >
                {busyId === tx.id ? "…" : "Aprobar"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
