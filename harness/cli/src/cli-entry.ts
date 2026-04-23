import { createFatalStartupLogger } from "./fatal-startup-log";

type CliMainModule = {
  main: () => Promise<void>;
};

type RunCliOptions = {
  loadMain?: () => Promise<CliMainModule>;
  addProcessListener?: (
    event: "uncaughtException" | "unhandledRejection",
    handler: (error: unknown) => void
  ) => void;
  exit?: (code: number) => void;
  registerFatalHandlers?: boolean;
  reportFatalError?: ReturnType<typeof createFatalStartupLogger>;
};

export async function runCli(options: RunCliOptions = {}) {
  const reportFatalError = options.reportFatalError ?? createFatalStartupLogger();
  const exit = options.exit ?? ((code: number) => process.exit(code));

  if (options.registerFatalHandlers ?? true) {
    const addProcessListener =
      options.addProcessListener ??
      ((event: "uncaughtException" | "unhandledRejection", handler: (error: unknown) => void) => {
        process.on(event, handler as never);
      });

    addProcessListener("uncaughtException", (error) => {
      reportFatalError(error, "uncaughtException");
      exit(1);
    });

    addProcessListener("unhandledRejection", (error) => {
      reportFatalError(error, "unhandledRejection");
      exit(1);
    });
  }

  try {
    const cliModule = await (options.loadMain ?? (() => import("./index-main")))();
    await cliModule.main();
  } catch (error) {
    reportFatalError(error, "startup");
    exit(1);
  }
}
