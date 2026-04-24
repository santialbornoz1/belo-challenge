import { ApproveTransactionUseCaseImpl } from "../../../src/application/use-cases/approve-transaction.use-case";
import { RejectTransactionUseCaseImpl } from "../../../src/application/use-cases/reject-transaction.use-case";
import type { TransferService } from "../../../src/application/services/transfer.service";
import type { Transaction } from "../../../src/domain/entities/transaction";

function tx(partial: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    idempotencyKey: "k",
    fromUser: { id: "a", name: "User A", email: "a@test.local" },
    toUser: { id: "b", name: "User B", email: "b@test.local" },
    amount: "100.00",
    status: "pending",
    createdAt: new Date(),
    confirmedAt: null,
    rejectedAt: null,
    ...partial,
  };
}

function mockService(): TransferService & {
  create: jest.Mock;
  approve: jest.Mock;
  reject: jest.Mock;
} {
  return {
    create: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
  };
}

describe("ApproveTransactionUseCaseImpl", () => {
  it("delegates to service.approve with id and actorUserId", async () => {
    const svc = mockService();
    const expected = tx({ status: "confirmed", confirmedAt: new Date() });
    svc.approve.mockResolvedValueOnce(expected);

    const uc = new ApproveTransactionUseCaseImpl(svc);
    const out = await uc.execute({ id: "tx-1", actorUserId: "admin" });

    expect(svc.approve).toHaveBeenCalledWith("tx-1", "admin");
    expect(out).toBe(expected);
  });

  it("propagates service errors", async () => {
    const svc = mockService();
    const err = new Error("not pending");
    svc.approve.mockRejectedValueOnce(err);

    const uc = new ApproveTransactionUseCaseImpl(svc);
    await expect(uc.execute({ id: "tx-1", actorUserId: "admin" })).rejects.toBe(err);
  });
});

describe("RejectTransactionUseCaseImpl", () => {
  it("delegates to service.reject with id and actorUserId", async () => {
    const svc = mockService();
    const expected = tx({ status: "rejected", rejectedAt: new Date() });
    svc.reject.mockResolvedValueOnce(expected);

    const uc = new RejectTransactionUseCaseImpl(svc);
    const out = await uc.execute({ id: "tx-1", actorUserId: "admin" });

    expect(svc.reject).toHaveBeenCalledWith("tx-1", "admin");
    expect(out).toBe(expected);
  });

  it("propagates service errors", async () => {
    const svc = mockService();
    const err = new Error("not pending");
    svc.reject.mockRejectedValueOnce(err);

    const uc = new RejectTransactionUseCaseImpl(svc);
    await expect(uc.execute({ id: "tx-1", actorUserId: "admin" })).rejects.toBe(err);
  });
});
