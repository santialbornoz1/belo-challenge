import type { Transaction } from "../../domain/entities/transaction";
import type { TransferService } from "../services/transfer.service";

export interface RejectTransactionCommand {
  id: string;
  actorUserId: string;
}

export interface RejectTransactionUseCase {
  execute(cmd: RejectTransactionCommand): Promise<Transaction>;
}

export class RejectTransactionUseCaseImpl implements RejectTransactionUseCase {
  constructor(private readonly transferService: TransferService) {}

  execute(cmd: RejectTransactionCommand): Promise<Transaction> {
    return this.transferService.reject(cmd.id, cmd.actorUserId);
  }
}
