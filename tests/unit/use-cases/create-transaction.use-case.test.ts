import { CreateTransactionUseCaseImpl } from "../../../src/application/use-cases/create-transaction.use-case";
import type { TransferService, CreateOutcome } from "../../../src/application/services/transfer.service";
import type { Transaction } from "../../../src/domain/entities/transaction";

function tx(partial: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    idempotencyKey: "key-1",
    fromUser: { id: "user-a", name: "User A", email: "a@test.local" },
    toUser: { id: "user-b", name: "User B", email: "b@test.local" },
    amount: "100.00",
    status: "confirmed",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    confirmedAt: new Date("2026-01-01T00:00:00Z"),
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

describe("CreateTransactionUseCaseImpl", () => {
  const baseCmd = {
    fromUserId: "user-a",
    toUserId: "user-b",
    amount: "100",
    idempotencyKey: "key-1",
  };

  it("delegates to TransferService.create and returns its outcome", async () => {
    const svc = mockService();
    const outcome: CreateOutcome = {
      transaction: tx(),
      alreadyExisted: false,
      movedFunds: true,
    };
    svc.create.mockResolvedValueOnce(outcome);

    const uc = new CreateTransactionUseCaseImpl(svc);
    const res = await uc.execute(baseCmd);

    expect(svc.create).toHaveBeenCalledWith(baseCmd);
    expect(res).toBe(outcome);
  });

  it("propagates errors from the service", async () => {
    const svc = mockService();
    const boom = new Error("boom");
    svc.create.mockRejectedValueOnce(boom);

    const uc = new CreateTransactionUseCaseImpl(svc);
    await expect(uc.execute(baseCmd)).rejects.toBe(boom);
  });
});
