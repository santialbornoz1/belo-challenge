import { useCallback, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../state";
import type { ApiErrorBody, Transaction, User } from "../types";

type Status = "idle" | "running" | "pass" | "fail";

interface Result {
  status: Status;
  summary?: string;
  expected?: string;
  actual?: unknown;
  durationMs?: number;
}

interface TestCtx {
  log: ReturnType<typeof useApp>["appendLog"];
  seq: () => string;
}

interface TestCase {
  id: string;
  group: string;
  title: string;
  expected: string;
  run: (ctx: TestCtx) => Promise<{ summary: string; actual?: unknown }>;
}

class AssertionError extends Error {
  actual?: unknown;
  constructor(message: string, actual?: unknown) {
    super(message);
    this.actual = actual;
  }
}

function assert(cond: unknown, message: string, actual?: unknown): asserts cond {
  if (!cond) throw new AssertionError(message, actual);
}

function errorOf(body: unknown): string | null {
  if (body && typeof body === "object" && "error" in body) {
    return (body as ApiErrorBody).error;
  }
  return null;
}

async function createFreshUser(
  ctx: TestCtx,
  balance: string,
  tag: string,
): Promise<User> {
  const email = `tc-${tag}-${Date.now()}-${ctx.seq()}@demo.com`;
  const res = await api.createUser(
    { name: `TC ${tag}`, email, initialBalance: balance },
    ctx.log,
  );
  assert(res.status === 201, `setup: createUser ${tag} got ${res.status}`, res.body);
  return res.body as User;
}

let cachedAdminId: string | null = null;
async function getAdminId(ctx: TestCtx): Promise<string> {
  if (cachedAdminId) return cachedAdminId;
  const res = await api.listUsers({ limit: 100 }, ctx.log);
  if (!res.ok || !res.body || typeof res.body !== "object" || !("data" in res.body)) {
    throw new AssertionError(
      "setup: no se pudo listar users para buscar admin",
      res.body,
    );
  }
  const admins = (res.body as { data: User[] }).data.filter((u) => u.role === "admin");
  if (admins.length === 0) {
    throw new AssertionError(
      "setup: no hay ningún user con rol admin. Corré `npm run db:seed` — Alice se crea como admin.",
    );
  }
  cachedAdminId = admins[0]!.id;
  return cachedAdminId;
}

async function createPending(
  ctx: TestCtx,
  from: User,
  to: User,
  amount: string,
): Promise<Transaction> {
  const res = await api.createTransaction(
    { fromUserId: from.id, toUserId: to.id, amount, idempotencyKey: crypto.randomUUID() },
    from.id,
    ctx.log,
  );
  assert(res.status === 201, `setup: createPending got ${res.status}`, res.body);
  const tx = res.body as Transaction;
  assert(tx.status === "pending", `setup: expected pending got ${tx.status}`, tx);
  return tx;
}

async function createConfirmed(
  ctx: TestCtx,
  from: User,
  to: User,
  amount: string,
): Promise<Transaction> {
  const res = await api.createTransaction(
    { fromUserId: from.id, toUserId: to.id, amount, idempotencyKey: crypto.randomUUID() },
    from.id,
    ctx.log,
  );
  assert(res.status === 201, `setup: createConfirmed got ${res.status}`, res.body);
  const tx = res.body as Transaction;
  assert(tx.status === "confirmed", `setup: expected confirmed got ${tx.status}`, tx);
  return tx;
}

const CASES: TestCase[] = [
  // ---------- Users ----------
  {
    id: "users-create-with-balance",
    group: "Users",
    title: "POST /api/users con initialBalance",
    expected: "201 + balance coincide con el enviado",
    async run(ctx) {
      const email = `tc-${Date.now()}-${ctx.seq()}@demo.com`;
      const res = await api.createUser(
        { name: "Alice TC", email, initialBalance: "12345.67" },
        ctx.log,
      );
      assert(res.status === 201, `expected 201, got ${res.status}`, res.body);
      const user = res.body as User;
      assert(user.balance === "12345.67", `balance mismatch: ${user.balance}`, user);
      return { summary: `user ${user.id.slice(0, 8)}… balance=${user.balance}`, actual: user };
    },
  },
  {
    id: "users-create-default-balance",
    group: "Users",
    title: "POST /api/users sin initialBalance",
    expected: "201 + balance default '0.00'",
    async run(ctx) {
      const email = `tc-${Date.now()}-${ctx.seq()}@demo.com`;
      const res = await api.createUser({ name: "NoBal", email }, ctx.log);
      assert(res.status === 201, `expected 201, got ${res.status}`, res.body);
      const user = res.body as User;
      assert(user.balance === "0.00", `balance mismatch: ${user.balance}`, user);
      return { summary: `default balance=${user.balance}`, actual: user };
    },
  },
  {
    id: "users-get-not-found",
    group: "Users",
    title: "GET /api/users/:id con uuid inexistente",
    expected: "404 USER_NOT_FOUND",
    async run(ctx) {
      const res = await api.getUser(crypto.randomUUID(), ctx.log);
      assert(res.status === 404, `expected 404, got ${res.status}`, res.body);
      assert(errorOf(res.body) === "USER_NOT_FOUND", `wrong error code`, res.body);
      return { summary: "404 USER_NOT_FOUND ✓", actual: res.body };
    },
  },

  // ---------- Create transaction — happy ----------
  {
    id: "tx-create-auto-confirm",
    group: "Create transaction",
    title: "Auto-confirm (amount ≤ 50000, fondos OK)",
    expected: "201 + status 'confirmed' + saldos movidos",
    async run(ctx) {
      const alice = await createFreshUser(ctx, "10000.00", "A");
      const bob = await createFreshUser(ctx, "0.00", "B");
      const res = await api.createTransaction(
        {
          fromUserId: alice.id,
          toUserId: bob.id,
          amount: "2500.00",
          idempotencyKey: crypto.randomUUID(),
        },
        alice.id,
        ctx.log,
      );
      assert(res.status === 201, `expected 201, got ${res.status}`, res.body);
      const tx = res.body as Transaction;
      assert(tx.status === "confirmed", `expected confirmed, got ${tx.status}`, tx);

      const a = (await api.getUser(alice.id, ctx.log)).body as User;
      const b = (await api.getUser(bob.id, ctx.log)).body as User;
      assert(a.balance === "7500.00", `alice balance ${a.balance}`, a);
      assert(b.balance === "2500.00", `bob balance ${b.balance}`, b);
      return { summary: `alice ${a.balance} · bob ${b.balance}`, actual: tx };
    },
  },
  {
    id: "tx-create-pending",
    group: "Create transaction",
    title: "Pending (amount > 50000)",
    expected: "201 + status 'pending' + saldos SIN tocar",
    async run(ctx) {
      const alice = await createFreshUser(ctx, "100000.00", "A");
      const bob = await createFreshUser(ctx, "0.00", "B");
      const res = await api.createTransaction(
        {
          fromUserId: alice.id,
          toUserId: bob.id,
          amount: "60000.00",
          idempotencyKey: crypto.randomUUID(),
        },
        alice.id,
        ctx.log,
      );
      assert(res.status === 201, `expected 201, got ${res.status}`, res.body);
      const tx = res.body as Transaction;
      assert(tx.status === "pending", `expected pending, got ${tx.status}`, tx);

      const a = (await api.getUser(alice.id, ctx.log)).body as User;
      const b = (await api.getUser(bob.id, ctx.log)).body as User;
      assert(a.balance === "100000.00", `alice balance moved: ${a.balance}`, a);
      assert(b.balance === "0.00", `bob balance moved: ${b.balance}`, b);
      return { summary: `pending · saldos sin mover`, actual: tx };
    },
  },
  {
    id: "tx-create-idempotency-hit",
    group: "Create transaction",
    title: "Idempotency hit (misma key dos veces)",
    expected: "2da request devuelve 200 con la MISMA tx",
    async run(ctx) {
      const alice = await createFreshUser(ctx, "10000.00", "A");
      const bob = await createFreshUser(ctx, "0.00", "B");
      const key = crypto.randomUUID();
      const r1 = await api.createTransaction(
        { fromUserId: alice.id, toUserId: bob.id, amount: "100.00", idempotencyKey: key },
        alice.id,
        ctx.log,
      );
      assert(r1.status === 201, `first expected 201, got ${r1.status}`, r1.body);
      const tx1 = r1.body as Transaction;

      const r2 = await api.createTransaction(
        { fromUserId: alice.id, toUserId: bob.id, amount: "100.00", idempotencyKey: key },
        alice.id,
        ctx.log,
      );
      assert(r2.status === 200, `second expected 200, got ${r2.status}`, r2.body);
      const tx2 = r2.body as Transaction;
      assert(tx2.id === tx1.id, `different id on idempotent call`, { tx1, tx2 });
      return { summary: `201 → 200, id idéntico ${tx1.id.slice(0, 8)}…`, actual: { tx1, tx2 } };
    },
  },

  // ---------- Create transaction — errores ----------
  {
    id: "tx-create-unauthorized",
    group: "Create transaction — errores",
    title: "Sin x-user-id",
    expected: "401 UNAUTHORIZED",
    async run(ctx) {
      const res = await api.createTransaction(
        {
          fromUserId: crypto.randomUUID(),
          toUserId: crypto.randomUUID(),
          amount: "10",
          idempotencyKey: crypto.randomUUID(),
        },
        "",
        ctx.log,
      );
      assert(res.status === 401, `expected 401, got ${res.status}`, res.body);
      assert(errorOf(res.body) === "UNAUTHORIZED", `wrong error code`, res.body);
      return { summary: "401 UNAUTHORIZED ✓", actual: res.body };
    },
  },
  {
    id: "tx-create-validation-bad-uuid",
    group: "Create transaction — errores",
    title: "Body inválido (UUID malo)",
    expected: "400 VALIDATION_ERROR",
    async run(ctx) {
      const alice = await createFreshUser(ctx, "10000.00", "A");
      const res = await api.createTransaction(
        {
          fromUserId: "not-a-uuid",
          toUserId: alice.id,
          amount: "100",
          idempotencyKey: crypto.randomUUID(),
        },
        alice.id,
        ctx.log,
      );
      assert(res.status === 400, `expected 400, got ${res.status}`, res.body);
      assert(errorOf(res.body) === "VALIDATION_ERROR", `wrong error code`, res.body);
      return { summary: "400 VALIDATION_ERROR ✓", actual: res.body };
    },
  },
  {
    id: "tx-create-invalid-amount-zero",
    group: "Create transaction — errores",
    title: "amount = '0'",
    expected: "400 INVALID_AMOUNT (o VALIDATION_ERROR si el schema lo filtra)",
    async run(ctx) {
      const alice = await createFreshUser(ctx, "10000.00", "A");
      const bob = await createFreshUser(ctx, "0.00", "B");
      const res = await api.createTransaction(
        {
          fromUserId: alice.id,
          toUserId: bob.id,
          amount: "0",
          idempotencyKey: crypto.randomUUID(),
        },
        alice.id,
        ctx.log,
      );
      assert(res.status === 400, `expected 400, got ${res.status}`, res.body);
      const code = errorOf(res.body);
      assert(
        code === "INVALID_AMOUNT" || code === "VALIDATION_ERROR",
        `unexpected code ${code}`,
        res.body,
      );
      return { summary: `400 ${code} ✓`, actual: res.body };
    },
  },
  {
    id: "tx-create-same-user",
    group: "Create transaction — errores",
    title: "fromUserId === toUserId",
    expected: "400 SAME_USER",
    async run(ctx) {
      const alice = await createFreshUser(ctx, "10000.00", "A");
      const res = await api.createTransaction(
        {
          fromUserId: alice.id,
          toUserId: alice.id,
          amount: "100",
          idempotencyKey: crypto.randomUUID(),
        },
        alice.id,
        ctx.log,
      );
      assert(res.status === 400, `expected 400, got ${res.status}`, res.body);
      assert(errorOf(res.body) === "SAME_USER", `wrong error code`, res.body);
      return { summary: "400 SAME_USER ✓", actual: res.body };
    },
  },
  {
    id: "tx-create-user-not-found",
    group: "Create transaction — errores",
    title: "toUserId inexistente",
    expected: "404 USER_NOT_FOUND",
    async run(ctx) {
      const alice = await createFreshUser(ctx, "10000.00", "A");
      const res = await api.createTransaction(
        {
          fromUserId: alice.id,
          toUserId: crypto.randomUUID(),
          amount: "100",
          idempotencyKey: crypto.randomUUID(),
        },
        alice.id,
        ctx.log,
      );
      assert(res.status === 404, `expected 404, got ${res.status}`, res.body);
      assert(errorOf(res.body) === "USER_NOT_FOUND", `wrong error code`, res.body);
      return { summary: "404 USER_NOT_FOUND ✓", actual: res.body };
    },
  },
  {
    id: "tx-create-insufficient-funds",
    group: "Create transaction — errores",
    title: "Fondos insuficientes (auto-approve)",
    expected: "422 INSUFFICIENT_FUNDS",
    async run(ctx) {
      const carol = await createFreshUser(ctx, "0.00", "C");
      const bob = await createFreshUser(ctx, "0.00", "B");
      const res = await api.createTransaction(
        {
          fromUserId: carol.id,
          toUserId: bob.id,
          amount: "100",
          idempotencyKey: crypto.randomUUID(),
        },
        carol.id,
        ctx.log,
      );
      assert(res.status === 422, `expected 422, got ${res.status}`, res.body);
      assert(errorOf(res.body) === "INSUFFICIENT_FUNDS", `wrong error code`, res.body);
      return { summary: "422 INSUFFICIENT_FUNDS ✓", actual: res.body };
    },
  },

  // ---------- List & Get ----------
  {
    id: "tx-list-by-user",
    group: "List & Get",
    title: "GET /api/transactions?userId=X",
    expected: "200 + incluye la tx creada (como from o to)",
    async run(ctx) {
      const alice = await createFreshUser(ctx, "10000.00", "A");
      const bob = await createFreshUser(ctx, "0.00", "B");
      const created = await createConfirmed(ctx, alice, bob, "100");
      const res = await api.listTransactions({ userId: alice.id }, alice.id, ctx.log);
      assert(res.status === 200, `expected 200, got ${res.status}`, res.body);
      const body = res.body as { data: Transaction[]; pagination: { total: number } };
      assert(
        body.data.some((t) => t.id === created.id),
        `created tx not in list`,
        body,
      );
      return { summary: `${body.pagination.total} tx visibles para alice`, actual: body };
    },
  },
  {
    id: "tx-list-filter-status",
    group: "List & Get",
    title: "List con status=pending",
    expected: "200 + todas las tx devueltas son 'pending'",
    async run(ctx) {
      const alice = await createFreshUser(ctx, "100000.00", "A");
      const bob = await createFreshUser(ctx, "0.00", "B");
      await createPending(ctx, alice, bob, "60000");
      const res = await api.listTransactions(
        { userId: alice.id, status: "pending" },
        alice.id,
        ctx.log,
      );
      assert(res.status === 200, `expected 200, got ${res.status}`, res.body);
      const body = res.body as { data: Transaction[] };
      assert(body.data.length > 0, `expected at least one pending`, body);
      assert(
        body.data.every((t) => t.status === "pending"),
        `non-pending leaked into list`,
        body,
      );
      return { summary: `${body.data.length} pending devueltas`, actual: body };
    },
  },
  {
    id: "tx-list-pagination",
    group: "List & Get",
    title: "List con limit=1&offset=0",
    expected: "200 + data.length ≤ 1 + pagination.limit === 1",
    async run(ctx) {
      const alice = await createFreshUser(ctx, "10000.00", "A");
      const bob = await createFreshUser(ctx, "0.00", "B");
      await createConfirmed(ctx, alice, bob, "100");
      await createConfirmed(ctx, alice, bob, "200");
      const res = await api.listTransactions(
        { userId: alice.id, limit: 1, offset: 0 },
        alice.id,
        ctx.log,
      );
      assert(res.status === 200, `expected 200, got ${res.status}`, res.body);
      const body = res.body as { data: Transaction[]; pagination: { limit: number; total: number } };
      assert(body.data.length <= 1, `limit ignored`, body);
      assert(body.pagination.limit === 1, `pagination.limit=${body.pagination.limit}`, body);
      return {
        summary: `data=${body.data.length} · total=${body.pagination.total}`,
        actual: body,
      };
    },
  },
  {
    id: "tx-get-not-found",
    group: "List & Get",
    title: "GET /api/transactions/:id inexistente",
    expected: "404 TRANSACTION_NOT_FOUND",
    async run(ctx) {
      const alice = await createFreshUser(ctx, "10000.00", "A");
      const res = await api.getTransaction(crypto.randomUUID(), alice.id, ctx.log);
      assert(res.status === 404, `expected 404, got ${res.status}`, res.body);
      assert(errorOf(res.body) === "TRANSACTION_NOT_FOUND", `wrong error code`, res.body);
      return { summary: "404 TRANSACTION_NOT_FOUND ✓", actual: res.body };
    },
  },

  // ---------- Approve / Reject ----------
  {
    id: "tx-approve-pending",
    group: "Approve / Reject",
    title: "PATCH /approve sobre pending",
    expected: "200 + status 'confirmed' + saldos movidos",
    async run(ctx) {
      const admin = await getAdminId(ctx);
      const alice = await createFreshUser(ctx, "100000.00", "A");
      const bob = await createFreshUser(ctx, "0.00", "B");
      const pending = await createPending(ctx, alice, bob, "60000");
      const res = await api.approveTransaction(pending.id, admin, ctx.log);
      assert(res.status === 200, `expected 200, got ${res.status}`, res.body);
      const tx = res.body as Transaction;
      assert(tx.status === "confirmed", `expected confirmed, got ${tx.status}`, tx);
      const a = (await api.getUser(alice.id, ctx.log)).body as User;
      const b = (await api.getUser(bob.id, ctx.log)).body as User;
      assert(a.balance === "40000.00", `alice balance ${a.balance}`, a);
      assert(b.balance === "60000.00", `bob balance ${b.balance}`, b);
      return { summary: `confirmed · alice ${a.balance} · bob ${b.balance}`, actual: tx };
    },
  },
  {
    id: "tx-approve-already-confirmed",
    group: "Approve / Reject",
    title: "Approve sobre una tx ya confirmed",
    expected: "409 INVALID_TRANSACTION_STATE",
    async run(ctx) {
      const admin = await getAdminId(ctx);
      const alice = await createFreshUser(ctx, "10000.00", "A");
      const bob = await createFreshUser(ctx, "0.00", "B");
      const confirmed = await createConfirmed(ctx, alice, bob, "100");
      const res = await api.approveTransaction(confirmed.id, admin, ctx.log);
      assert(res.status === 409, `expected 409, got ${res.status}`, res.body);
      assert(
        errorOf(res.body) === "INVALID_TRANSACTION_STATE",
        `wrong error code`,
        res.body,
      );
      return { summary: "409 INVALID_TRANSACTION_STATE ✓", actual: res.body };
    },
  },
  {
    id: "tx-approve-insufficient-on-approve",
    group: "Approve / Reject",
    title: "Approve cuando el saldo cambió y ya no alcanza",
    expected: "422 INSUFFICIENT_FUNDS",
    async run(ctx) {
      // Alice arranca con 70k. Crea pending de 60k (no toca saldo).
      // Después confirma otra tx de 40k (saldo queda en 30k).
      // Al approve del pending ya no le alcanzan 60k.
      const admin = await getAdminId(ctx);
      const alice = await createFreshUser(ctx, "70000.00", "A");
      const bob = await createFreshUser(ctx, "0.00", "B");
      const pending = await createPending(ctx, alice, bob, "60000");
      await createConfirmed(ctx, alice, bob, "40000");
      const res = await api.approveTransaction(pending.id, admin, ctx.log);
      assert(res.status === 422, `expected 422, got ${res.status}`, res.body);
      assert(
        errorOf(res.body) === "INSUFFICIENT_FUNDS",
        `wrong error code`,
        res.body,
      );
      return { summary: "422 INSUFFICIENT_FUNDS ✓", actual: res.body };
    },
  },
  {
    id: "tx-reject-pending",
    group: "Approve / Reject",
    title: "PATCH /reject sobre pending",
    expected: "200 + status 'rejected' + saldos sin tocar",
    async run(ctx) {
      const admin = await getAdminId(ctx);
      const alice = await createFreshUser(ctx, "100000.00", "A");
      const bob = await createFreshUser(ctx, "0.00", "B");
      const pending = await createPending(ctx, alice, bob, "60000");
      const res = await api.rejectTransaction(pending.id, admin, ctx.log);
      assert(res.status === 200, `expected 200, got ${res.status}`, res.body);
      const tx = res.body as Transaction;
      assert(tx.status === "rejected", `expected rejected, got ${tx.status}`, tx);
      const a = (await api.getUser(alice.id, ctx.log)).body as User;
      assert(a.balance === "100000.00", `alice balance moved: ${a.balance}`, a);
      return { summary: "rejected · saldos intactos", actual: tx };
    },
  },
  {
    id: "tx-reject-already-rejected",
    group: "Approve / Reject",
    title: "Reject sobre una tx ya rechazada",
    expected: "409 INVALID_TRANSACTION_STATE",
    async run(ctx) {
      const admin = await getAdminId(ctx);
      const alice = await createFreshUser(ctx, "100000.00", "A");
      const bob = await createFreshUser(ctx, "0.00", "B");
      const pending = await createPending(ctx, alice, bob, "60000");
      const r1 = await api.rejectTransaction(pending.id, admin, ctx.log);
      assert(r1.status === 200, `setup reject got ${r1.status}`, r1.body);
      const r2 = await api.rejectTransaction(pending.id, admin, ctx.log);
      assert(r2.status === 409, `expected 409, got ${r2.status}`, r2.body);
      assert(
        errorOf(r2.body) === "INVALID_TRANSACTION_STATE",
        `wrong error code`,
        r2.body,
      );
      return { summary: "409 INVALID_TRANSACTION_STATE ✓", actual: r2.body };
    },
  },
  {
    id: "tx-approve-not-found",
    group: "Approve / Reject",
    title: "Approve sobre uuid inexistente",
    expected: "404 TRANSACTION_NOT_FOUND",
    async run(ctx) {
      const admin = await getAdminId(ctx);
      const res = await api.approveTransaction(crypto.randomUUID(), admin, ctx.log);
      assert(res.status === 404, `expected 404, got ${res.status}`, res.body);
      assert(
        errorOf(res.body) === "TRANSACTION_NOT_FOUND",
        `wrong error code`,
        res.body,
      );
      return { summary: "404 TRANSACTION_NOT_FOUND ✓", actual: res.body };
    },
  },

  // ---------- Health ----------
  {
    id: "health",
    group: "Health",
    title: "GET /health",
    expected: "200 + { status: 'ok' }",
    async run(ctx) {
      const res = await api.health(ctx.log);
      assert(res.status === 200, `expected 200, got ${res.status}`, res.body);
      const body = res.body as { status?: string };
      assert(body.status === "ok", `status=${body.status}`, body);
      return { summary: `status=${body.status} · ${res.durationMs}ms`, actual: body };
    },
  },
];

export function TestCases() {
  const { appendLog } = useApp();
  const [results, setResults] = useState<Record<string, Result>>({});
  const [runningAll, setRunningAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const seqRef = useMemo(() => ({ n: 0 }), []);
  const makeCtx = useCallback(
    (): TestCtx => ({
      log: appendLog,
      seq: () => {
        seqRef.n += 1;
        return String(seqRef.n);
      },
    }),
    [appendLog, seqRef],
  );

  const runOne = useCallback(
    async (tc: TestCase) => {
      setResults((r) => ({ ...r, [tc.id]: { status: "running" } }));
      const started = performance.now();
      try {
        const { summary, actual } = await tc.run(makeCtx());
        setResults((r) => ({
          ...r,
          [tc.id]: {
            status: "pass",
            summary,
            actual,
            durationMs: Math.round(performance.now() - started),
          },
        }));
      } catch (err) {
        const actual = err instanceof AssertionError ? err.actual : undefined;
        const msg = err instanceof Error ? err.message : String(err);
        setResults((r) => ({
          ...r,
          [tc.id]: {
            status: "fail",
            summary: msg,
            actual,
            durationMs: Math.round(performance.now() - started),
          },
        }));
      }
    },
    [makeCtx],
  );

  const runAll = useCallback(async () => {
    setRunningAll(true);
    setResults({});
    for (const tc of CASES) {
      await runOne(tc);
    }
    setRunningAll(false);
  }, [runOne]);

  const byGroup = useMemo(() => {
    const map = new Map<string, TestCase[]>();
    for (const tc of CASES) {
      if (!map.has(tc.group)) map.set(tc.group, []);
      map.get(tc.group)!.push(tc);
    }
    return Array.from(map.entries());
  }, []);

  const stats = useMemo(() => {
    let pass = 0;
    let fail = 0;
    for (const r of Object.values(results)) {
      if (r.status === "pass") pass += 1;
      if (r.status === "fail") fail += 1;
    }
    return { pass, fail, total: CASES.length };
  }, [results]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 flex items-center gap-4 flex-wrap">
        <button
          onClick={runAll}
          disabled={runningAll}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded font-medium"
        >
          {runningAll ? "Corriendo…" : `Run all (${CASES.length})`}
        </button>
        <button
          onClick={() => setResults({})}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm"
        >
          Reset
        </button>
        <div className="text-sm text-slate-400 flex items-center gap-3 ml-auto">
          <span>✓ {stats.pass}</span>
          <span className={stats.fail > 0 ? "text-red-400" : ""}>✗ {stats.fail}</span>
          <span className="text-slate-500">/ {stats.total}</span>
        </div>
        <p className="w-full text-xs text-slate-500">
          Cada caso crea los users/txs que necesita con emails/keys frescos. No hace falta
          resetear la DB entre runs — podés volver a correr las veces que quieras.
        </p>
      </div>

      {byGroup.map(([group, cases]) => (
        <section key={group} className="bg-slate-900/60 border border-slate-800 rounded-lg">
          <div className="px-4 py-2 border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
            {group}
          </div>
          <div className="divide-y divide-slate-800">
            {cases.map((tc) => {
              const r = results[tc.id];
              const s: Status = r?.status ?? "idle";
              const isOpen = expandedId === tc.id;
              return (
                <div key={tc.id}>
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <StatusBadge s={s} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{tc.title}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        esperado: {tc.expected}
                      </div>
                      {r?.summary && (
                        <div
                          className={`text-[11px] truncate ${
                            s === "pass"
                              ? "text-emerald-300"
                              : s === "fail"
                                ? "text-red-300"
                                : "text-slate-400"
                          }`}
                        >
                          {r.summary}
                        </div>
                      )}
                    </div>
                    {r?.durationMs !== undefined && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {r.durationMs}ms
                      </span>
                    )}
                    <button
                      onClick={() => runOne(tc)}
                      disabled={s === "running" || runningAll}
                      className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded border border-slate-700"
                    >
                      run
                    </button>
                    {r && (
                      <button
                        onClick={() => setExpandedId(isOpen ? null : tc.id)}
                        className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700"
                      >
                        {isOpen ? "hide" : "view"}
                      </button>
                    )}
                  </div>
                  {isOpen && r && (
                    <pre className="px-4 pb-3 text-[11px] font-mono text-slate-400 whitespace-pre-wrap max-h-72 overflow-auto">
                      {JSON.stringify(r.actual ?? null, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function StatusBadge({ s }: { s: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    idle: { label: "·", cls: "bg-slate-800 text-slate-500" },
    running: { label: "…", cls: "bg-amber-500/20 text-amber-300" },
    pass: { label: "✓", cls: "bg-emerald-500/20 text-emerald-300" },
    fail: { label: "✗", cls: "bg-red-500/20 text-red-300" },
  };
  const { label, cls } = map[s];
  return (
    <span
      className={`w-5 h-5 inline-flex items-center justify-center rounded text-xs font-bold ${cls}`}
    >
      {label}
    </span>
  );
}
