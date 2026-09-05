export class RangkuminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends RangkuminError {}

export class ConflictError extends RangkuminError {}

export class IdempotencyConflictError extends ConflictError {}

export class VersionConflictError extends ConflictError {}

export class CategoryConflictError extends ConflictError {}

export class InvalidCategoryError extends RangkuminError {}

export class SavingsGoalConflictError extends ConflictError {}

export class InsufficientBalanceError extends ConflictError {}

export class ImmutableTransactionError extends ConflictError {}
