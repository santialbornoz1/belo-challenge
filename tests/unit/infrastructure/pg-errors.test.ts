import {
  PG_CODES,
  pgCode,
  pgConstraint,
  pgDetail,
  isPgUniqueViolation,
  isPgCheckViolation,
  isPgForeignKeyViolation,
} from "../../../src/infrastructure/repositories/pg-errors";

describe("pg-errors helpers", () => {
  it("pgCode reads from direct or nativeError", () => {
    expect(pgCode({ code: "23505" })).toBe("23505");
    expect(pgCode({ nativeError: { code: "23503" } })).toBe("23503");
    expect(pgCode({})).toBeUndefined();
    expect(pgCode(null)).toBeUndefined();
    expect(pgCode(undefined)).toBeUndefined();
    expect(pgCode("string-not-object")).toBeUndefined();
  });

  it("pgConstraint and pgDetail fall back to empty string when missing", () => {
    expect(pgConstraint({ constraint: "x" })).toBe("x");
    expect(pgConstraint({ nativeError: { constraint: "y" } })).toBe("y");
    expect(pgConstraint({})).toBe("");
    expect(pgDetail({ detail: "foo" })).toBe("foo");
    expect(pgDetail({ nativeError: { detail: "bar" } })).toBe("bar");
    expect(pgDetail(null)).toBe("");
  });

  describe("isPgUniqueViolation", () => {
    it("matches when code is 23505 and no hint", () => {
      expect(isPgUniqueViolation({ code: PG_CODES.UNIQUE_VIOLATION })).toBe(true);
    });

    it("matches by hint on constraint", () => {
      expect(
        isPgUniqueViolation(
          { code: PG_CODES.UNIQUE_VIOLATION, constraint: "users_email_unique" },
          "email",
        ),
      ).toBe(true);
    });

    it("matches by hint on detail", () => {
      expect(
        isPgUniqueViolation(
          {
            code: PG_CODES.UNIQUE_VIOLATION,
            constraint: "some_other",
            detail: "Key (idempotency_key)=(x) already exists.",
          },
          "idempotency_key",
        ),
      ).toBe(true);
    });

    it("reads from nativeError when outer fields are missing", () => {
      expect(
        isPgUniqueViolation(
          {
            nativeError: {
              code: PG_CODES.UNIQUE_VIOLATION,
              constraint: "users_email_unique",
            },
          },
          "email",
        ),
      ).toBe(true);
    });

    it("returns false when code does not match", () => {
      expect(
        isPgUniqueViolation({ code: "42P01" }, "email"),
      ).toBe(false);
    });

    it("returns false when hint is provided but no match", () => {
      expect(
        isPgUniqueViolation(
          {
            code: PG_CODES.UNIQUE_VIOLATION,
            constraint: "foo",
            detail: "bar",
          },
          "email",
        ),
      ).toBe(false);
    });
  });

  describe("isPgCheckViolation", () => {
    it("matches when code is 23514 without hint", () => {
      expect(isPgCheckViolation({ code: PG_CODES.CHECK_VIOLATION })).toBe(true);
    });

    it("matches with hint on constraint", () => {
      expect(
        isPgCheckViolation(
          {
            code: PG_CODES.CHECK_VIOLATION,
            constraint: "transactions_amount_positive",
          },
          "transactions_amount_positive",
        ),
      ).toBe(true);
    });

    it("returns false for different code even if constraint matches", () => {
      expect(
        isPgCheckViolation(
          { code: "23505", constraint: "transactions_amount_positive" },
          "transactions_amount_positive",
        ),
      ).toBe(false);
    });
  });

  describe("isPgForeignKeyViolation", () => {
    it("matches 23503 code", () => {
      expect(isPgForeignKeyViolation({ code: PG_CODES.FOREIGN_KEY_VIOLATION })).toBe(
        true,
      );
    });

    it("matches via nativeError", () => {
      expect(
        isPgForeignKeyViolation({
          nativeError: { code: PG_CODES.FOREIGN_KEY_VIOLATION },
        }),
      ).toBe(true);
    });

    it("returns false for unrelated codes", () => {
      expect(isPgForeignKeyViolation({ code: "23505" })).toBe(false);
      expect(isPgForeignKeyViolation(null)).toBe(false);
      expect(isPgForeignKeyViolation(undefined)).toBe(false);
    });
  });
});
