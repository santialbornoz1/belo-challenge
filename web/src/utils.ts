const ARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatARS(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "$ —";
  return ARS.format(n);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

const AVATAR_COLORS = [
  "bg-emerald-600",
  "bg-sky-600",
  "bg-violet-600",
  "bg-pink-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-teal-600",
  "bg-indigo-600",
];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx]!;
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  if (diff < 0) return "hace un instante";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "hace unos segundos";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `hace ${day} d`;
  return new Date(iso).toLocaleDateString("es-AR");
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface FriendlyError {
  title: string;
  detail?: string;
}

export function translateError(code: string | null, fallback?: string): FriendlyError {
  switch (code) {
    case "INSUFFICIENT_FUNDS":
      return { title: "Saldo insuficiente", detail: "No tenés fondos suficientes para cubrir esta transferencia." };
    case "USER_NOT_FOUND":
      return { title: "Usuario no encontrado", detail: "El destinatario no existe." };
    case "SAME_USER":
      return { title: "No podés transferirte a vos mismo", detail: "Elegí otro destinatario." };
    case "INVALID_AMOUNT":
      return { title: "Monto inválido", detail: "Ingresá un monto mayor a cero." };
    case "VALIDATION_ERROR":
      return { title: "Datos inválidos", detail: "Revisá los datos ingresados." };
    case "UNAUTHORIZED":
      return { title: "Sesión requerida", detail: "Volvé a iniciar sesión." };
    case "DUPLICATE_IDEMPOTENCY_KEY":
      return { title: "Transferencia duplicada", detail: "Ya procesamos una transferencia idéntica." };
    case "INVALID_TRANSACTION_STATE":
      return { title: "La transferencia ya no está pendiente", detail: "Probablemente ya fue aprobada o rechazada." };
    case "TRANSACTION_NOT_FOUND":
      return { title: "Transferencia no encontrada", detail: "Verificá el identificador." };
    case "EMAIL_ALREADY_EXISTS":
      return { title: "Ese email ya está registrado", detail: "Probá con otro." };
    case "NETWORK":
      return { title: "Sin conexión al servidor", detail: "Revisá que el backend esté corriendo." };
    default:
      return {
        title: fallback ?? "No pudimos procesar tu solicitud",
        detail: code ? `Código: ${code}` : undefined,
      };
  }
}
