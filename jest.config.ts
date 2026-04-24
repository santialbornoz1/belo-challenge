import type { Config } from "jest";

const config: Config = {
  testTimeout: 30000,
  projects: [
    {
      displayName: "unit",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
    },
    {
      displayName: "integration",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
      setupFiles: ["<rootDir>/tests/setup.ts"],
    },
    {
      displayName: "smoke",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/smoke/**/*.test.ts"],
      setupFiles: ["<rootDir>/tests/setup.ts"],
    },
    {
      displayName: "e2e",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/e2e/**/*.test.ts"],
      setupFiles: ["<rootDir>/tests/setup.ts"],
    },
  ],
};

export default config;
