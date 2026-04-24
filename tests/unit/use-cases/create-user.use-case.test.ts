import { CreateUserUseCaseImpl } from "../../../src/application/use-cases/create-user.use-case";
import type { UserRepository } from "../../../src/domain/ports/user.repository";
import type { User, CreateUserInput } from "../../../src/domain/entities/user";
import { ValidationError } from "../../../src/domain/errors";

function mockUserRepo(): UserRepository & {
  create: jest.Mock;
  findById: jest.Mock;
  findByEmail: jest.Mock;
  list: jest.Mock;
  findByIdsForUpdate: jest.Mock;
  updateBalance: jest.Mock;
} {
  return {
    create: jest.fn(async (input: CreateUserInput): Promise<User> => ({
      id: "u-1",
      name: input.name,
      email: input.email,
      balance: input.initialBalance ?? "0.00",
      role: "user",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    })),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    list: jest.fn(),
    findByIdsForUpdate: jest.fn(),
    updateBalance: jest.fn(),
  };
}

describe("CreateUserUseCase", () => {
  it("defaults balance to '0.00' when initialBalance is omitted", async () => {
    const repo = mockUserRepo();
    const uc = new CreateUserUseCaseImpl(repo);
    await uc.execute({ name: "A", email: "a@test.local" });
    expect(repo.create).toHaveBeenCalledWith({
      name: "A",
      email: "a@test.local",
      initialBalance: "0.00",
    });
  });

  it("normalizes initialBalance to 2 decimals", async () => {
    const repo = mockUserRepo();
    const uc = new CreateUserUseCaseImpl(repo);
    await uc.execute({ name: "A", email: "a@test.local", initialBalance: "100" });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ initialBalance: "100.00" }),
    );
  });

  it("normalizes '123.4' -> '123.40'", async () => {
    const repo = mockUserRepo();
    const uc = new CreateUserUseCaseImpl(repo);
    await uc.execute({ name: "A", email: "a@test.local", initialBalance: "123.4" });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ initialBalance: "123.40" }),
    );
  });

  it("rejects negative initialBalance with ValidationError (no repo call)", async () => {
    const repo = mockUserRepo();
    const uc = new CreateUserUseCaseImpl(repo);
    await expect(
      uc.execute({ name: "A", email: "a@test.local", initialBalance: "-1" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("rejects non-finite initialBalance (Infinity, NaN)", async () => {
    const repo = mockUserRepo();
    const uc = new CreateUserUseCaseImpl(repo);
    await expect(
      uc.execute({ name: "A", email: "a@test.local", initialBalance: "Infinity" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("propagates repository errors unchanged", async () => {
    const repo = mockUserRepo();
    const boom = new Error("db down");
    repo.create.mockRejectedValueOnce(boom);
    const uc = new CreateUserUseCaseImpl(repo);
    await expect(
      uc.execute({ name: "A", email: "a@test.local" }),
    ).rejects.toBe(boom);
  });
});
