import { useApp } from "../state";
import type { Transaction, TransactionStatus } from "../types";
import { avatarColor, formatARS, formatDateTime, initials } from "../utils";
import { Modal } from "./Modal";

export function TxDetail({
  tx,
  onClose,
}: {
  tx: Transaction;
  onClose: () => void;
}) {
  const { currentUser } = useApp();
  const selfId = currentUser?.id;
  const isSender = selfId === tx.fromUser.id;
  const isReceiver = selfId === tx.toUser.id;

  return (
    <Modal title="Detalle de la transferencia" onClose={onClose}>
      <div className="text-center py-4">
        <StatusIcon status={tx.status} />
        <h3 className="mt-3 font-semibold text-lg">
          <StatusTitle tx={tx} isSender={isSender} isReceiver={isReceiver} />
        </h3>
        <div
          className={`mt-1 text-2xl font-semibold font-mono ${
            isSender
              ? "text-red-300"
              : isReceiver
                ? "text-emerald-300"
                : "text-slate-200"
          }`}
        >
          {isSender ? "−" : isReceiver ? "+" : ""}
          {formatARS(tx.amount)}
        </div>
      </div>

      <div className="space-y-3">
        <Party label="De" user={tx.fromUser} />
        <Party label="Para" user={tx.toUser} />
      </div>

      <dl className="mt-5 text-sm divide-y divide-slate-800 border-t border-slate-800">
        <Row label="Estado">
          <StatusBadge status={tx.status} />
        </Row>
        <Row label="Creada">{formatDateTime(tx.createdAt)}</Row>
        {tx.confirmedAt && <Row label="Confirmada">{formatDateTime(tx.confirmedAt)}</Row>}
        {tx.rejectedAt && <Row label="Rechazada">{formatDateTime(tx.rejectedAt)}</Row>}
        <Row label="ID de operación">
          <span className="font-mono text-xs text-slate-400">{tx.id}</span>
        </Row>
      </dl>

      <button
        onClick={onClose}
        className="mt-6 w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm"
      >
        Cerrar
      </button>
    </Modal>
  );
}

function Party({
  label,
  user,
}: {
  label: string;
  user: Transaction["fromUser"];
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold ${avatarColor(user.id)}`}
      >
        {initials(user.name)}
      </div>
      <div className="flex-1">
        <div className="text-[10px] uppercase text-slate-500">{label}</div>
        <div className="text-sm font-medium">{user.name}</div>
        <div className="text-xs text-slate-500">{user.email}</div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-200">{children}</dd>
    </div>
  );
}

function StatusIcon({ status }: { status: TransactionStatus }) {
  if (status === "confirmed")
    return (
      <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-2xl bg-emerald-500/20 text-emerald-300">
        ✓
      </div>
    );
  if (status === "pending")
    return (
      <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-2xl bg-amber-500/20 text-amber-300">
        ⏳
      </div>
    );
  return (
    <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-2xl bg-red-500/20 text-red-300">
      ✕
    </div>
  );
}

function StatusTitle({
  tx,
  isSender,
  isReceiver,
}: {
  tx: Transaction;
  isSender: boolean;
  isReceiver: boolean;
}) {
  if (tx.status === "confirmed") {
    if (isSender) return <>Le enviaste a {tx.toUser.name}</>;
    if (isReceiver) return <>{tx.fromUser.name} te envió dinero</>;
    return <>Transferencia confirmada</>;
  }
  if (tx.status === "pending") {
    if (isSender) return <>Esperando aprobación</>;
    if (isReceiver) return <>Pendiente de aprobación</>;
    return <>Pendiente</>;
  }
  if (isSender) return <>Tu transferencia fue rechazada</>;
  if (isReceiver) return <>La transferencia fue rechazada</>;
  return <>Rechazada</>;
}

function StatusBadge({ status }: { status: TransactionStatus }) {
  const map: Record<TransactionStatus, string> = {
    confirmed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    pending: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    rejected: "bg-red-500/20 text-red-300 border-red-500/40",
  };
  const label: Record<TransactionStatus, string> = {
    confirmed: "confirmada",
    pending: "pendiente",
    rejected: "rechazada",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] border ${map[status]}`}>
      {label[status]}
    </span>
  );
}
