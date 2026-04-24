import {
  AppError,
  ValidationError,
  InvalidAmountError,
  SameUserError,
  UserNotFoundError,
  InsufficientFundsError,
  TransactionNotFoundError,
  InvalidTransactionStateError,
  DuplicateIdempotencyKeyError,
  DuplicateEmailError,
  UnauthorizedError,
  ForbiddenError,
} from "../../../src/domain/errors";

describe("domain errors — statusCode / code / details contract", () => {
  it("AppError keeps message, statusCode, code, details", () => {
    const e = new AppError("boom", 500, "BOOM", { x: 1 });
    expect(e).toBeInstanceOf(Error);
    expect(e.statusCode).toBe(500);
    expect(e.code).toBe("BOOM");
    expect(e.details).toEqual({ x: 1 });
    expect(e.message).toBe("boom");
    expect(e.name).toBe("AppError");
  });

  it("ValidationError -> 400 VALIDATION_ERROR", () => {
    const e = new ValidationError("bad", { field: "amount" });
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe("VALIDATION_ERROR");
    expect(e.details).toEqual({ field: "amount" });
  });

  it("InvalidAmountError -> 400 INVALID_AMOUNT", () => {
    const e = new InvalidAmountError();
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe("INVALID_AMOUNT");
  });

  it("SameUserError -> 400 SAME_USER", () => {
    const e = new SameUserError();
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe("SAME_USER");
  });

  it("UserNotFoundError -> 404 USER_NOT_FOUND with id in details", () => {
    const e = new UserNotFoundError("u-1");
    expect(e.statusCode).toBe(404);
    expect(e.code).toBe("USER_NOT_FOUND");
    expect(e.details).toEqual({ id: "u-1" });
  });

  it("InsufficientFundsError -> 422 with balance/amount in details", () => {
    const e = new InsufficientFundsError("u-1", "10.00", "20.00");
    expect(e.statusCode).toBe(422);
    expect(e.code).toBe("INSUFFICIENT_FUNDS");
    expect(e.details).toEqual({
      userId: "u-1",
      balance: "10.00",
      amount: "20.00",
    });
  });

  it("TransactionNotFoundError -> 404", () => {
    const e = new TransactionNotFoundError("tx-1");
    expect(e.statusCode).toBe(404);
    expect(e.code).toBe("TRANSACTION_NOT_FOUND");
    expect(e.details).toEqual({ id: "tx-1" });
  });

  it("InvalidTransactionStateError -> 409 with state context", () => {
    const e = new InvalidTransactionStateError("tx-1", "confirmed", "pending");
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe("INVALID_TRANSACTION_STATE");
    expect(e.details).toEqual({
      id: "tx-1",
      currentStatus: "confirmed",
      expectedStatus: "pending",
    });
  });

  it("DuplicateIdempotencyKeyError -> 409 with the key in details", () => {
    const e = new DuplicateIdempotencyKeyError("key-1");
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe("DUPLICATE_IDEMPOTENCY_KEY");
    expect(e.details).toEqual({ idempotencyKey: "key-1" });
  });

  it("DuplicateEmailError -> 409 with email in details", () => {
    const e = new DuplicateEmailError("a@b");
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe("DUPLICATE_EMAIL");
    expect(e.details).toEqual({ email: "a@b" });
  });

  it("UnauthorizedError -> 401 with default and custom messages", () => {
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new UnauthorizedError().code).toBe("UNAUTHORIZED");
    expect(new UnauthorizedError("token exp").message).toBe("token exp");
  });

  it("ForbiddenError -> 403", () => {
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new ForbiddenError().code).toBe("FORBIDDEN");
  });

  it("all typed errors are instanceof AppError", () => {
    const errors = [
      new ValidationError("x"),
      new InvalidAmountError(),
      new SameUserError(),
      new UserNotFoundError("x"),
      new InsufficientFundsError("x", "0", "0"),
      new TransactionNotFoundError("x"),
      new InvalidTransactionStateError("x", "a", "b"),
      new DuplicateIdempotencyKeyError("x"),
      new DuplicateEmailError("x"),
      new UnauthorizedError(),
      new ForbiddenError(),
    ];
    for (const e of errors) {
      expect(e).toBeInstanceOf(AppError);
      expect(e).toBeInstanceOf(Error);
    }
  });
});
