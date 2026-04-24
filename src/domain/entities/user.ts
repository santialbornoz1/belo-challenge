export type UserRole = "user" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  balance: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  name: string;
  email: string;
  initialBalance?: string;
}
