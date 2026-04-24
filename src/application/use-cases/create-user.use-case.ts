import Decimal from "decimal.js";
import type { UserRepository } from "../../domain/ports/user.repository";
import type { User, CreateUserInput } from "../../domain/entities/user";
import { ValidationError } from "../../domain/errors";

export interface CreateUserUseCase {
  execute(input: CreateUserInput): Promise<User>;
}

export class CreateUserUseCaseImpl implements CreateUserUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(input: CreateUserInput): Promise<User> {
    if (input.initialBalance !== undefined) {
      const b = new Decimal(input.initialBalance);
      if (!b.isFinite() || b.lt(0)) {
        throw new ValidationError("initialBalance must be non-negative");
      }
    }
    return this.userRepo.create({
      ...input,
      initialBalance: input.initialBalance
        ? new Decimal(input.initialBalance).toFixed(2)
        : "0.00",
    });
  }
}
