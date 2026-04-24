import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../state";
import type { ApiErrorBody, Transaction, User } from "../types";
import { avatarColor, formatARS, initials, translateError } from "../utils";
import { Modal } from "./Modal";

type Step = "recipient" | "amount" | "confirm" | "result";
type Outcome =
  | { kind: "ok"; tx: Transaction; isPending: boolean; isIdempotent: boolean }
  | { kind: "error"; title: string; detail?: string };

export function SendMoney({
  onClose,
  onViewTx,
}: {
  onClose: () => void;
  onViewTx: (tx: Transaction) => void;
}) {
  const { currentUser, users, reloadCurrentUser, appendLog, bumpTxVersion } = useApp();

  const [step, setStep] = useState<Step>("recipient");
  const [recipient, setRecipient] = useState<User | null>(null);
  const [amount, setAmount] = useState("");
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const available = useMemo(
    () => users.filter((u) => u.id !== currentUser?.id),
    [users, currentUser?.id],
  );

  if (!currentUser) return null;

  const pickRecipient = (u: User) => {
    setRecipient(u);
    setStep("amount");
  };

  const requiresApproval = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) && n > 50000;
  }, [amount]);

  const send = async () => {
    if (!recipient) return;
    setSubmitting(true);
    const res = await api.createTransaction(
      {
        fromUserId: currentUser.id,
        toUserId: recipient.id,
        amount: amount.trim(),
        idempotencyKey,
      },
      currentUser.id,
      appendLog,
    );
    setSubmitting(false);
    if (res.ok && res.body && typeof res.body === "object" && "status" in res.body) {
      const tx = res.body as Transaction;
      setOutcome({
        kind: "ok",
        tx,
        isPending: tx.status === "pending",
        isIdempotent: res.status === 200,
      });
      void reloadCurrentUser();
      bumpTxVersion();
    } else {
      const t = translateError((res.body as ApiErrorBody | null)?.error ?? null);
      setOutcome({ kind: "error", title: t.title, detail: t.detail });
    }
    setStep("result");
  };

  return (
    <Modal title="Enviar dinero" onClose={onClose}>
      <Stepper step={step} />

      {step === "recipient" && (
        <div className="space-y-4">
          <h3 className="font-medium">¿A quién le querés enviar?</h3>

          {available.length > 0 ? (
            <div className="space-y-2">
              {available.map((u) => (
                <button
                  key={u.id}
                  onClick={() => pickRecipient(u)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 transition"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${avatarColor(u.id)}`}
                  >
                    {initials(u.name)}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No hay otras cuentas en el sistema para enviarles dinero.
            </p>
          )}
        </div>
      )}

      {step === "amount" && recipient && (
        <AmountStep
          recipient={recipient}
          currentUser={currentUser}
          amount={amount}
          onAmountChange={setAmount}
          requiresApproval={requiresApproval}
          onBack={() => setStep("recipient")}
          onNext={() => setStep("confirm")}
        />
      )}

      {step === "confirm" && recipient && (
        <ConfirmStep
          recipient={recipient}
          currentUser={currentUser}
          amount={amount}
          requiresApproval={requiresApproval}
          submitting={submitting}
          onBack={() => setStep("amount")}
          onSend={send}
        />
      )}

      {step === "result" && outcome && (
        <ResultStep
          outcome={outcome}
          onClose={onClose}
          onRetry={() => {
            setOutcome(null);
            setStep(recipient ? "amount" : "recipient");
          }}
          onViewTx={onViewTx}
        />
      )}
    </Modal>
  );
}

function Stepper({ step }: { step: Step }) {
  const order: Step[] = ["recipient", "amount", "confirm", "result"];
  const activeIdx = order.indexOf(step);
  const labels = ["Destinatario", "Monto", "Confirmar", "Resultado"];
  return (
    <div className="flex items-center gap-2 mb-5">
      {labels.map((label, i) => (
        <div key={label} className="flex-1 flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              i <= activeIdx
                ? "bg-emerald-500 text-slate-950"
                : "bg-slate-800 text-slate-500"
            }`}
          >
            {i + 1}
          </div>
          <span
            className={`text-[11px] ${i <= activeIdx ? "text-slate-200" : "text-slate-500"}`}
          >
            {label}
          </span>
          {i < labels.length - 1 && (
            <div
              className={`flex-1 h-px ${i < activeIdx ? "bg-emerald-500" : "bg-slate-800"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function AmountStep({
  recipient,
  currentUser,
  amount,
  onAmountChange,
  requiresApproval,
  onBack,
  onNext,
}: {
  recipient: User;
  currentUser: User;
  amount: string;
  onAmountChange: (v: string) => void;
  requiresApproval: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    // autofocus: handled inside input via autoFocus attr
  }, []);
  const n = Number(amount);
  const valid = Number.isFinite(n) && n > 0;

  return (
    <div>
      <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 mb-4">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold ${avatarColor(recipient.id)}`}
        >
          {initials(recipient.name)}
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-500">Para</div>
          <div className="font-medium text-sm">{recipient.name}</div>
        </div>
      </div>

      <label className="block text-xs text-slate-400 mb-1">Monto en pesos</label>
      <input
        autoFocus
        inputMode="decimal"
        value={amount}
        onChange={(e) => onAmountChange(e.target.value.replace(",", "."))}
        placeholder="0.00"
        className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500/50 outline-none rounded-lg px-3 py-4 font-mono text-3xl text-center"
      />
      <p className="text-[11px] text-slate-500 mt-2 text-center">
        Tu saldo actual: {formatARS(currentUser.balance)}
      </p>

      {requiresApproval && (
        <div className="mt-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-200">
          Los envíos mayores a $50.000 quedan <b>pendientes de aprobación manual</b>. El
          saldo no se descuenta hasta que se aprueben.
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <button
          onClick={onBack}
          className="flex-1 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm"
        >
          Volver
        </button>
        <button
          onClick={onNext}
          disabled={!valid}
          className="flex-[2] py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-medium"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

function ConfirmStep({
  recipient,
  currentUser,
  amount,
  requiresApproval,
  submitting,
  onBack,
  onSend,
}: {
  recipient: User;
  currentUser: User;
  amount: string;
  requiresApproval: boolean;
  submitting: boolean;
  onBack: () => void;
  onSend: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 text-center">
        <div className="text-xs uppercase text-slate-500">Vas a enviar</div>
        <div className="text-3xl font-semibold my-2">{formatARS(amount)}</div>
        <div className="text-sm text-slate-400">a {recipient.name}</div>
        <div className="text-xs text-slate-500 mt-1">{recipient.email}</div>
      </div>

      <div className="text-xs text-slate-400 space-y-1">
        <div className="flex justify-between">
          <span>Desde</span>
          <span className="text-slate-200">
            {currentUser.name} · {formatARS(currentUser.balance)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Tipo de operación</span>
          <span className={requiresApproval ? "text-amber-300" : "text-emerald-300"}>
            {requiresApproval ? "requiere aprobación" : "confirmación inmediata"}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          disabled={submitting}
          onClick={onBack}
          className="flex-1 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm disabled:opacity-50"
        >
          Volver
        </button>
        <button
          disabled={submitting}
          onClick={onSend}
          className="flex-[2] py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-medium"
        >
          {submitting ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}

function ResultStep({
  outcome,
  onClose,
  onRetry,
  onViewTx,
}: {
  outcome: Outcome;
  onClose: () => void;
  onRetry: () => void;
  onViewTx: (tx: Transaction) => void;
}) {
  if (outcome.kind === "ok") {
    const { tx, isPending, isIdempotent } = outcome;
    return (
      <div className="text-center py-4">
        <div
          className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center text-2xl ${
            isPending ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"
          }`}
        >
          {isPending ? "⏳" : "✓"}
        </div>
        <h3 className="mt-4 font-semibold text-lg">
          {isPending ? "Quedó pendiente de aprobación" : "¡Listo! Enviamos tu dinero"}
        </h3>
        <p className="mt-2 text-sm text-slate-400 max-w-sm mx-auto">
          {isPending
            ? "Superaste los $50.000: la transferencia se va a confirmar cuando un administrador la apruebe."
            : `Le enviaste ${formatARS(tx.amount)} a ${tx.toUser.name}.`}
          {isIdempotent && (
            <span className="block text-[11px] text-slate-500 mt-1">
              Detectamos que ya habías enviado esta misma operación, no la duplicamos.
            </span>
          )}
        </p>
        <div className="mt-6 flex gap-2">
          <button
            onClick={() => onViewTx(tx)}
            className="flex-1 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm"
          >
            Ver detalle
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-medium"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-4">
      <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-2xl bg-red-500/20 text-red-300">
        ✕
      </div>
      <h3 className="mt-4 font-semibold text-lg">{outcome.title}</h3>
      {outcome.detail && (
        <p className="mt-2 text-sm text-slate-400 max-w-sm mx-auto">{outcome.detail}</p>
      )}
      <div className="mt-6 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm"
        >
          Cancelar
        </button>
        <button
          onClick={onRetry}
          className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-medium"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
