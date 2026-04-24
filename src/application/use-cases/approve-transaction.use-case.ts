import type { Transaction } from "../../domain/entities/transaction";
import type { TransferService } from "../services/transfer.service";

export interface ApproveTransactionCommand {
  id: string;
  actorUserId: string;
}

export interface ApproveTransactionUseCase {
  execute(cmd: ApproveTransactionCommand): Promise<Transaction>;
}

export class ApproveTransactionUseCaseImpl implements ApproveTransactionUseCase {
  constructor(private readonly transferService: TransferService) {}

  execute(cmd: ApproveTransactionCommand): Promise<Transaction> {
    return this.transferService.approve(cmd.id, cmd.actorUserId);
  }
}
