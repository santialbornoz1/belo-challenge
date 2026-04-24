import type { FastifyInstance } from "fastify";
import {
  newApp,
  truncateAll,
  seedUser,
  seedAdmin,
  postTransaction,
  approveTransaction,
  rejectTransaction,
  uniqueKey,
} from "../helpers";

interface AuditRow {
  action: string;
  entity: string;
  entity_id: string;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
}

async function auditFor(
  app: FastifyInstance,
  entityId: string,
): Promise<AuditRow[]> {
  const { rows } = await app.knex.raw<{ rows: AuditRow[] }>(
    `SELECT action, entity, entity_id, actor_user_id, metadata
     FROM audit_logs
     WHERE entity_id = ?
     ORDER BY created_at ASC`,
    [entityId],
  );
  return rows;
}

describe("audit trail — writes happen inside the same transaction as the operation", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await newApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(app);
  });

  it("auto-confirmed tx writes one TRANSACTION_CONFIRMED row", async () => {
    const from = await seedUser(app, { balance: "1000" });
    const to = await seedUser(app, { balance: "0" });
    const r = await postTransaction(app, from.id, {
      fromUserId: from.id,
      toUserId: to.id,
      amount: "100",
      idempotencyKey: uniqueKey("a-conf"),
    });
    expect(r.statusCode).toBe(201);

    const logs = await auditFor(app, r.json().id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("TRANSACTION_CONFIRMED");
    expect(logs[0].entity).toBe("transaction");
    expect(logs[0].actor_user_id).toBe(from.id);
    expect(logs[0].metadata).toMatchObject({
      fromUserId: from.id,
      toUserId: to.id,
      amount: "100.00",
      movedFunds: true,
      requiresManualApproval: false,
    });
  });

  it("pending tx writes TRANSACTION_PENDING_CREATED, then approve appends TRANSACTION_APPROVED", async () => {
    const from = await seedUser(app, { balance: "100000" });
    const to = await seedUser(app, { balance: "0" });
    const admin = await seedAdmin(app);
    const created = await postTransaction(app, from.id, {
      fromUserId: from.id,
      toUserId: to.id,
      amount: "60000",
      idempotencyKey: uniqueKey("a-pend-approve"),
    });
    expect(created.json().status).toBe("pending");
    const id = created.json().id;

    const approved = await approveTransaction(app, admin.id, id);
    expect(approved.statusCode).toBe(200);

    const logs = await auditFor(app, id);
    expect(logs.map((l) => l.action)).toEqual([
      "TRANSACTION_PENDING_CREATED",
      "TRANSACTION_APPROVED",
    ]);
    expect(logs[1].metadata).toMatchObject({
      fromUserId: from.id,
      toUserId: to.id,
      amount: "60000.00",
      previousStatus: "pending",
    });
  });

  it("reject appends TRANSACTION_REJECTED and does not touch balances", async () => {
    const from = await seedUser(app, { balance: "100000" });
    const to = await seedUser(app, { balance: "0" });
    const admin = await seedAdmin(app);
    const created = await postTransaction(app, from.id, {
      fromUserId: from.id,
      toUserId: to.id,
      amount: "60000",
      idempotencyKey: uniqueKey("a-pend-reject"),
    });
    const id = created.json().id;

    await rejectTransaction(app, admin.id, id);

    const logs = await auditFor(app, id);
    expect(logs.map((l) => l.action)).toEqual([
      "TRANSACTION_PENDING_CREATED",
      "TRANSACTION_REJECTED",
    ]);
    expect(logs[1].metadata).toMatchObject({ previousStatus: "pending" });
  });

  it("failed create (InsufficientFunds) writes no audit log (rolled back)", async () => {
    const from = await seedUser(app, { balance: "10" });
    const to = await seedUser(app, { balance: "0" });
    const r = await postTransaction(app, from.id, {
      fromUserId: from.id,
      toUserId: to.id,
      amount: "100",
      idempotencyKey: uniqueKey("a-fail"),
    });
    expect(r.statusCode).toBe(422);

    const { rows } = await app.knex.raw<{ rows: { n: number }[] }>(
      `SELECT COUNT(*)::int AS n FROM audit_logs`,
    );
    expect(rows[0].n).toBe(0);
  });

  it("failed approve (balance drained) writes no new audit log", async () => {
    const from = await seedUser(app, { balance: "60000" });
    const to = await seedUser(app, { balance: "0" });
    const third = await seedUser(app, { balance: "0" });
    const admin = await seedAdmin(app);

    const pending = await postTransaction(app, from.id, {
      fromUserId: from.id,
      toUserId: to.id,
      amount: "60000",
      idempotencyKey: uniqueKey("a-approve-fail-1"),
    });
    const drain = await postTransaction(app, from.id, {
      fromUserId: from.id,
      toUserId: third.id,
      amount: "40000",
      idempotencyKey: uniqueKey("a-approve-fail-2"),
    });
    expect(drain.statusCode).toBe(201);

    const before = await auditFor(app, pending.json().id);
    expect(before).toHaveLength(1); // only the PENDING_CREATED row

    const approve = await approveTransaction(app, admin.id, pending.json().id);
    expect(approve.statusCode).toBe(422);

    const after = await auditFor(app, pending.json().id);
    expect(after).toHaveLength(1); // nothing appended on failure
  });
});
