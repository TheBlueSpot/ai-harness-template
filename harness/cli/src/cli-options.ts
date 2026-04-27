export type CliOptionSpec<T extends string> = {
  flags: readonly T[];
  valueFlags?: readonly T[];
  conflicts?: readonly (readonly T[])[];
};

export type ParsedCliOptions<T extends string> = {
  flags: Set<T>;
  values: Map<T, string>;
};

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export function parseCliOptions<T extends string>(argv: readonly string[], spec: CliOptionSpec<T>): ParsedCliOptions<T> {
  const allowed = new Set(spec.flags);
  const valueFlags = new Set(spec.valueFlags ?? []);
  const flags = new Set<T>();
  const values = new Map<T, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--") || !allowed.has(arg as T)) {
      throw new CliUsageError(`Unknown option: ${arg}`);
    }

    const flag = arg as T;
    flags.add(flag);
    if (!valueFlags.has(flag)) {
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new CliUsageError(`Missing value for ${flag}`);
    }

    values.set(flag, value);
    index += 1;
  }

  for (const conflict of spec.conflicts ?? []) {
    if (conflict.every((flag) => flags.has(flag))) {
      throw new CliUsageError(`Conflicting options: ${conflict.join(", ")}`);
    }
  }

  return { flags, values };
}
