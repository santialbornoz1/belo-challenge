import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../state";
import type { ApiErrorBody } from "../types";
import { avatarColor, formatARS, initials, translateError } from "../utils";

const DEMO_USERS = [
  { name: "Alice Demo", email: "alice@demo.com", initialBalance: "100000.00" },
  { name: "Bob Demo", email: "bob@demo.com", initialBalance: "50000.00" },
  { name: "Carol Demo", email: "carol@demo.com", initialBalance: "0.00" },
];

export function Login() {
  const { users, loadingUsers, refreshUsers, login, appendLog } = useApp();
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  const seedDemo = async () => {
    setSeeding(true);
    setSeedError(null);
    const results = await Promise.all(
      DEMO_USERS.map((u) => api.createUser(u, appendLog)),
    );
    const failed = results.filter((r) => {
      if (r.ok) return false;
      const code = (r.body as ApiErrorBody | null)?.error;
      return code !== "EMAIL_ALREADY_EXISTS";
    });
    if (failed.length > 0) {
      const first = failed[0]!;
      const t = translateError(
        (first.body as ApiErrorBody | null)?.error ?? null,
        "No pudimos crear los usuarios de demo",
      );
      setSeedError(`${t.title}${t.detail ? ` — ${t.detail}` : ""}`);
    }
    await refreshUsers();
    setSeeding(false);
  };

  return (
    <div className="max-w-md mx-auto px-5 pt-10 pb-6">
      <div className="flex items-center justify-center gap-3 mb-10">
        <img src="/belo-logo.png" alt="Belo" className="h-10 w-auto" />
        <span className="text-xl font-semibold tracking-tight text-slate-400">Lite</span>
      </div>

      <h1 className="text-2xl font-semibold mb-1">¿Con qué cuenta querés entrar?</h1>
      <p className="text-sm text-slate-400 mb-6">
        Elegí una de las cuentas registradas.
      </p>

      {loadingUsers && users.length === 0 && (
        <div className="py-10 text-center text-sm text-slate-500">
          Cargando cuentas…
        </div>
      )}

      {!loadingUsers && users.length === 0 && (
        <div className="py-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-2xl mb-3">
            🌱
          </div>
          <div className="text-sm text-slate-300 mb-1">
            Todavía no hay cuentas en el sistema.
          </div>
          <div className="text-xs text-slate-500 mb-5">
            Podés cargar las cuentas de demo (Alice, Bob y Carol) con un click.
          </div>

          {seedError && (
            <div className="mb-4 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-200 text-left">
              {seedError}
            </div>
          )}

          <button
            onClick={() => void seedDemo()}
            disabled={seeding}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 font-medium"
          >
            {seeding ? "Creando cuentas de demo…" : "Crear cuentas de demo"}
          </button>
          <button
            onClick={() => void refreshUsers()}
            disabled={seeding}
            className="mt-2 text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
          >
            Volver a intentar leer del servidor
          </button>
        </div>
      )}

      <div className="space-y-2">
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => login(u.id)}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 hover:bg-slate-900/80 transition"
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${avatarColor(u.id)}`}
            >
              {initials(u.name)}
            </div>
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="font-medium">{u.name}</span>
                {u.role === "admin" && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] border border-amber-500/40 bg-amber-500/10 text-amber-300">
                    admin
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400">{u.email}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm">{formatARS(u.balance)}</div>
              <div className="text-[10px] text-slate-500">saldo</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
