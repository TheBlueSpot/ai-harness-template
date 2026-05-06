import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildObservationTemplate, buildProbeDeck } from "./observation_template";

type CliOptions = {
  game?: string;
  out?: string;
  probeOut?: string;
  sessionDate?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (
      (arg === "--game" || arg === "--out" || arg === "--probe-out" || arg === "--session-date") &&
      !next
    ) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--game") {
      options.game = next;
      index += 1;
      continue;
    }

    if (arg === "--out") {
      options.out = next;
      index += 1;
      continue;
    }

    if (arg === "--probe-out") {
      options.probeOut = next;
      index += 1;
      continue;
    }

    if (arg === "--session-date") {
      options.sessionDate = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.game) {
    throw new Error("Pass --game <slug>.");
  }

  return options;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const observationPath = options.out ?? `.local/${options.game}-playtest.json`;
  const outPath = resolve(observationPath);
  const probeOutPath = options.probeOut ? resolve(options.probeOut) : undefined;
  const payload = buildObservationTemplate({
    game: options.game,
    sessionDate: options.sessionDate,
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  if (probeOutPath) {
    mkdirSync(dirname(probeOutPath), { recursive: true });
    writeFileSync(
      probeOutPath,
      `${buildProbeDeck({
        game: options.game,
        sessionDate: options.sessionDate,
        observationPath,
      })}\n`,
      "utf8",
    );
  }

  console.log(`# Initialized playtest observation`);
  console.log("");
  console.log(`- game: ${options.game}`);
  console.log(`- output: ${outPath}`);
  if (probeOutPath) {
    console.log(`- probe deck: ${probeOutPath}`);
  }
  console.log(`- busy-frame artifact: ${resolve(`.local/${options.game}-busy-frame-capture.json`)}`);
  console.log(`- trace artifact: ${resolve(`.local/${options.game}-trace-evidence.json`)}`);
}

main();
