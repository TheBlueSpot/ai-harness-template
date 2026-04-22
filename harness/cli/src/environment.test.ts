import { describe, expect, test } from "bun:test";
import { isProductionEnvironment } from "./environment";

describe("environment", () => {
  test("treats NODE_ENV=production as production", () => {
    expect(isProductionEnvironment({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionEnvironment({ NODE_ENV: "development" })).toBe(false);
    expect(isProductionEnvironment({})).toBe(false);
  });
});
