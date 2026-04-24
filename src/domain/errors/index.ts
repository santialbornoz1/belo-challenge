export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class InvalidAmountError extends AppError {
  constructor() {
    super("Amount must be greater than zero", 400, "INVALID_AMOUNT");
  }
}

export class SameUserError extends AppError {
  constructor() {
    super("From user and to user must be different", 400, "SAME_USER");
  }
}

export class UserNotFoundError extends AppError {
  constructor(id: string) {
    super(`User ${id} not found`, 404, "USER_NOT_FOUND", { id });
  }
}

export class InsufficientFundsError extends AppError {
  constructor(userId: string, balance: string, amount: string) {
    super("Insufficient funds", 422, "INSUFFICIENT_FUNDS", { userId, balance, amount });
  }
}

export class TransactionNotFoundError extends AppError {
  constructor(id: string) {
    super(`Transaction ${id} not found`, 404, "TRANSACTION_NOT_FOUND", { id });
  }
}

export class InvalidTransactionStateError extends AppError {
  constructor(id: string, currentStatus: string, expectedStatus: string) {
    super(
      `Transaction ${id} is in status '${currentStatus}', expected '${expectedStatus}'`,
      409,
      "INVALID_TRANSACTION_STATE",
      { id, currentStatus, expectedStatus },
    );
  }
}

export class DuplicateIdempotencyKeyError extends AppError {
  constructor(key: string) {
    super(`Idempotency key already used`, 409, "DUPLICATE_IDEMPOTENCY_KEY", { idempotencyKey: key });
  }
}

export class DuplicateEmailError extends AppError {
  constructor(email: string) {
    super(`Email already registered`, 409, "DUPLICATE_EMAIL", { email });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}
