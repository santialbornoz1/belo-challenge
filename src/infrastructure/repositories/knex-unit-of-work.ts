import { Model } from "objection";
import type { UnitOfWork } from "../../domain/ports/unit-of-work";
import type { DomainTrx } from "../../domain/ports/audit.repository";

export class KnexUnitOfWork implements UnitOfWork {
  async runInTransaction<T>(work: (trx: DomainTrx) => Promise<T>): Promise<T> {
    return Model.transaction(async (trx) => {
      return work(trx as unknown as DomainTrx);
    });
  }
}
