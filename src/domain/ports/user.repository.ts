import type { User, CreateUserInput } from "../entities/user";
import type { DomainTrx } from "./audit.repository";

export interface UserRepository {
  // Read / create (standalone connection)
  create(input: CreateUserInput): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(limit: number, offset: number): Promise<User[]>;

  /**
   * Row-locks the given users (`SELECT ... FOR UPDATE`) within the passed
   * transaction. Pass ids in a deterministic order (e.g. ascending) to
   * prevent deadlocks between concurrent transfers on the same pair.
   * Returns a map keyed by id — missing users are simply absent.
   */
  findByIdsForUpdate(ids: string[], trx: DomainTrx): Promise<Map<string, User>>;

  /**
   * Sets the user's balance to an exact value. Assumes the row was locked
   * in the same transaction; otherwise callers race.
   */
  updateBalance(id: string, newBalance: string, trx: DomainTrx): Promise<void>;
}
