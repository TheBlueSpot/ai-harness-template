type HarnessEnvironment = Record<string, string | undefined>;

export function isProductionEnvironment(env: HarnessEnvironment = Bun.env) {
  return env.NODE_ENV === "production";
}
