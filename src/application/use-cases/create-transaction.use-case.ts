import type {
  Transaction,
  CreateTransactionInput,
} from "../../domain/entities/transaction";
import type { TransferService } from "../services/transfer.service";

export interface CreateTransactionCommand extends CreateTransactionInput {}

export interface CreateTransactionOutcome {
  transaction: Transaction;
  alreadyExisted: boolean;
  movedFunds: boolean;
}

export interface CreateTransactionUseCase {
  execute(cmd: CreateTransactionCommand): Promise<CreateTransactionOutcome>;
}

export class CreateTransactionUseCaseImpl implements CreateTransactionUseCase {
  constructor(private readonly transferService: TransferService) {}

  execute(cmd: CreateTransactionCommand): Promise<CreateTransactionOutcome> {
    return this.transferService.create(cmd);
  }
}
