/**
 * Global Jest setup — runs once before all tests in each file.
 *
 * Forces the test DB URL so we never touch the dev database, and makes
 * the app logger silent for cleaner test output.
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://belo:belo123@localhost:5432/belo_challenge_test";
process.env.LOG_LEVEL = "silent";
