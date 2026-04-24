import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../state";
import type { Transaction, TransactionStatus } from "../types";
import { avatarColor, formatARS, initials, timeAgo } from "../utils";

type Filter = "all" | "sent" | "received" | "pending";
const PAGE_SIZE = 10;

export function Home({
  onSend,
  onOpenAdmin,
  onOpenTx,
}: {
  onSend: () => void;
  onOpenAdmin: () => void;
  onOpenTx: (tx: Transaction) => void;
}) {
  const { currentUser, logout, reloadCurrentUser, appendLog, txVersion } = useApp();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const userId = currentUser?.id ?? "";

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const res = await api.listTransactions(
      {
        userId,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        ...(filter === "pending" ? { status: "pending" as const } : {}),
      },
      userId,
      appendLog,
    );
    if (res.ok && res.body && typeof res.body === "object" && "data" in res.body) {
      const body = res.body as { data: Transaction[]; pagination: { total: number } };
      setTxs(body.data);
      setTotal(body.pagination.total);
    }
    setLoading(false);
  }, [userId, page, filter, appendLog, txVersion]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [filter]);

  useEffect(() => {
    void reloadCurrentUser();
  }, [reloadCurrentUser]);

  const filtered = useMemo(() => {
    if (!userId) return [];
    if (filter === "sent") return txs.filter((t) => t.fromUser.id === userId);
    if (filter === "received") return txs.filter((t) => t.toUser.id === userId);
    if (filter === "pending") return txs.filter((t) => t.status === "pending");
    return txs;
  }, [txs, filter, userId]);

  const pendingOutgoing = useMemo(
    () =>
      txs.filter(
        (t) => t.status === "pending" && t.fromUser.id === userId,
      ),
    [txs, userId],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!currentUser) return null;

  return (
    <div className="max-w-2xl mx-auto px-5 pt-6 pb-8">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white ${avatarColor(currentUser.id)}`}
          >
            {initials(currentUser.name)}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              Hola
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{currentUser.name}</span>
              {currentUser.role === "admin" && (
                <span className="px-1.5 py-0.5 rounded text-[10px] border border-amber-500/40 bg-amber-500/10 text-amber-300">
                  admin
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-sm"
          >
            Cuenta ▾
          </button>
          {menuOpen && (
            <div
              onMouseLeave={() => setMenuOpen(false)}
              className="absolute right-0 mt-2 w-52 rounded-lg bg-slate-900 border border-slate-800 shadow-xl overflow-hidden z-10"
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  void reloadCurrentUser();
                  void load();
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-800"
              >
                Refrescar saldo
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-800 border-t border-slate-800"
              >
                Cambiar de cuenta
              </button>
            </div>
          )}
        </div>
      </header>

      <section className="mb-6 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-6">
        <div className="text-sm text-emerald-100/80 mb-2">Saldo disponible</div>
        <div className="text-4xl font-semibold tracking-tight">
          {formatARS(currentUser.balance)}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onSend}
            className="flex-1 py-3 rounded-xl bg-slate-950 text-emerald-300 font-semibold hover:bg-slate-900 transition"
          >
            Enviar dinero
          </button>
        </div>
      </section>

      {pendingOutgoing.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/30 flex items-center justify-center text-amber-200">
              ⏳
            </div>
            <div className="flex-1">
              <div className="font-medium text-amber-100">
                {pendingOutgoing.length === 1
                  ? "Tenés 1 transferencia esperando aprobación"
                  : `Tenés ${pendingOutgoing.length} transferencias esperando aprobación`}
              </div>
              <div className="text-xs text-amber-200/70 mt-0.5">
                Los envíos de más de $50.000 requieren aprobación manual. El saldo no se
                descuenta hasta que se aprueben.
              </div>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Actividad</h2>
          <div className="text-xs text-slate-500">{total} movimientos</div>
        </div>

        <div className="flex gap-1 mb-3 text-xs">
          {(
            [
              { id: "all", label: "Todas" },
              { id: "sent", label: "Enviadas" },
              { id: "received", label: "Recibidas" },
              { id: "pending", label: "Pendientes" },
            ] as { id: Filter; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full border transition ${
                filter === f.id
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-200"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
          {loading && filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Cargando…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              No hay movimientos que mostrar.
            </div>
          )}
          <ul className="divide-y divide-slate-800">
            {filtered.map((tx) => (
              <li key={tx.id}>
                <button
                  onClick={() => onOpenTx(tx)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 text-left"
                >
                  <TxAvatar tx={tx} selfId={userId} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <TxTitle tx={tx} selfId={userId} />
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2">
                      <span>{timeAgo(tx.createdAt)}</span>
                      <StatusBadge status={tx.status} />
                    </div>
                  </div>
                  <div
                    className={`font-mono text-sm font-medium ${
                      tx.fromUser.id === userId
                        ? "text-red-300"
                        : "text-emerald-300"
                    }`}
                  >
                    {tx.fromUser.id === userId ? "−" : "+"}
                    {formatARS(tx.amount)}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800 text-xs">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2 py-1 rounded disabled:opacity-30 hover:bg-slate-800"
              >
                ‹ anterior
              </button>
              <span className="text-slate-500">
                Página {page + 1} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= total}
                className="px-2 py-1 rounded disabled:opacity-30 hover:bg-slate-800"
              >
                siguiente ›
              </button>
            </div>
          )}
        </div>
      </section>

      {currentUser.role === "admin" && (
        <div className="mt-8 text-center">
          <button
            onClick={onOpenAdmin}
            className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 decoration-dotted"
          >
            Revisar transferencias pendientes del sistema (admin)
          </button>
        </div>
      )}
    </div>
  );
}

function TxAvatar({ tx, selfId }: { tx: Transaction; selfId: string }) {
  const other = tx.fromUser.id === selfId ? tx.toUser : tx.fromUser;
  return (
    <div
      className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-white ${avatarColor(other.id)}`}
    >
      {initials(other.name)}
    </div>
  );
}

function TxTitle({ tx, selfId }: { tx: Transaction; selfId: string }) {
  const verb = tx.fromUser.id === selfId ? "Enviaste a" : "Recibiste de";
  const other = tx.fromUser.id === selfId ? tx.toUser : tx.fromUser;
  return (
    <span>
      <span className="text-slate-400">{verb}</span>{" "}
      <span className="font-medium">{other.name}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: TransactionStatus }) {
  if (status === "confirmed")
    return <span className="text-emerald-400">· confirmada</span>;
  if (status === "pending")
    return <span className="text-amber-300">· pendiente</span>;
  return <span className="text-red-300">· rechazada</span>;
}
