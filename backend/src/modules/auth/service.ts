import { AppError } from "../../shared/errors.js";
import type { AuthRepository } from "./ports.js";

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async bootstrap(subject: string) {
    if (!subject.trim() || subject.length > 500)
      throw new AppError("AUTH_REQUIRED");
    const result = await this.repository.bootstrap(subject);
    if (result.kind === "blocked") throw new AppError("USER_SUSPENDED");
    return result.bootstrap;
  }
}
