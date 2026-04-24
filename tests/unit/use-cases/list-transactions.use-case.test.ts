import { ListTransactionsUseCaseImpl } from "../../../src/application/use-cases/list-transactions.use-case";
import type { TransactionRepository } from "../../../src/domain/ports/transaction.repository";

function mockRepo(): TransactionRepository & { list: jest.Mock } {
  return {
    findById: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    list: jest.fn().mockResolvedValue({ transactions: [], total: 0 }),
    findByIdForUpdate: jest.fn(),
    insert: jest.fn(),
    markConfirmed: jest.fn(),
    markRejected: jest.fn(),
  };
}

describe("ListTransactionsUseCase", () => {
  it("defaults limit=20 and offset=0 when omitted", async () => {
    const repo = mockRepo();
    const uc = new ListTransactionsUseCaseImpl(repo);
    await uc.execute({});
    expect(repo.list).toHaveBeenCalledWith({
      userId: undefined,
      status: undefined,
      limit: 20,
      offset: 0,
    });
  });

  it("clamps limit to MAX_LIMIT=100", async () => {
    const repo = mockRepo();
    const uc = new ListTransactionsUseCaseImpl(repo);
    await uc.execute({ limit: 10_000 });
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it("clamps limit to min=1 when caller asks for <= 0", async () => {
    const repo = mockRepo();
    const uc = new ListTransactionsUseCaseImpl(repo);
    await uc.execute({ limit: 0 });
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
    await uc.execute({ limit: -5 });
    expect(repo.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 1 }),
    );
  });

  it("clamps negative offset to 0", async () => {
    const repo = mockRepo();
    const uc = new ListTransactionsUseCaseImpl(repo);
    await uc.execute({ offset: -10 });
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
  });

  it("passes through userId and status filters", async () => {
    const repo = mockRepo();
    const uc = new ListTransactionsUseCaseImpl(repo);
    await uc.execute({ userId: "u-1", status: "pending" });
    expect(repo.list).toHaveBeenCalledWith({
      userId: "u-1",
      status: "pending",
      limit: 20,
      offset: 0,
    });
  });

  it("returns the repository payload unchanged", async () => {
    const repo = mockRepo();
    const payload = {
      transactions: [
        {
          id: "tx-1",
          idempotencyKey: "k",
          fromUser: { id: "a", name: "User A", email: "a@test.local" },
          toUser: { id: "b", name: "User B", email: "b@test.local" },
          amount: "10.00",
          status: "confirmed" as const,
          createdAt: new Date(),
          confirmedAt: new Date(),
          rejectedAt: null,
        },
      ],
      total: 1,
    };
    repo.list.mockResolvedValueOnce(payload);
    const uc = new ListTransactionsUseCaseImpl(repo);
    expect(await uc.execute({})).toBe(payload);
  });
});
