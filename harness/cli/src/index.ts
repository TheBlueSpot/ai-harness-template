import { startHarnessServer } from "./server";

const port = Number(Bun.env.HARNESS_CLI_PORT ?? 8787);

startHarnessServer({
  port: Number.isFinite(port) ? port : 8787
});

