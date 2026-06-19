#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CraftpixDownloadError,
  DEFAULT_TIMEOUT,
  executeDownload,
} from "./craftpix";

type PlanDefaults = {
  cookieFile?: string;
  outputDir?: string;
  overwrite?: boolean;
  resolveOnly?: boolean;
  timeout?: number;
  debug?: boolean;
};

type PlanItem = {
  sourceUrl?: string;
  outputDir?: string;
  cookieFile?: string;
  filename?: string;
  subitem?: string;
  overwrite?: boolean;
  resolveOnly?: boolean;
  timeout?: number;
  debug?: boolean;
  note?: string;
};

type DownloadPlan = {
  defaults?: PlanDefaults;
  downloads?: PlanItem[];
};

type CliOptions = {
  planFile: string;
  continueOnError: boolean;
  forceResolveOnly: boolean;
  forceOverwrite: boolean;
  debug: boolean;
};

function printUsage(): void {
  console.log(`Run a Craftpix download plan from a local JSON file.

Usage:
  bun .agents/skills/craftpix-download/scripts/download_plan.ts <plan_file> [options]

Arguments:
  <plan_file>             JSON file with defaults and downloads[]

Options:
  --continue-on-error     Keep running later entries after a failure
  --resolve-only          Resolve URLs only, do not download archives
  --overwrite             Replace existing output files for every entry
  --debug                 Log resolved cookie file path and parsed cookie names
  -h, --help              Show this help message`);
}

function parseArgs(argv: string[]): CliOptions {
  const positionals: string[] = [];
  let continueOnError = false;
  let forceResolveOnly = false;
  let forceOverwrite = false;
  let debug = false;

  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    switch (arg) {
      case "--continue-on-error":
        continueOnError = true;
        break;
      case "--resolve-only":
        forceResolveOnly = true;
        break;
      case "--overwrite":
        forceOverwrite = true;
        break;
      case "--debug":
        debug = true;
        break;
      default:
        throw new CraftpixDownloadError(`Unknown argument: ${arg}`);
    }
  }

  if (positionals.length !== 1) {
    throw new CraftpixDownloadError("Expected exactly one plan file path.");
  }

  return {
    planFile: positionals[0],
    continueOnError,
    forceResolveOnly,
    forceOverwrite,
    debug,
  };
}

function readPlan(planFile: string): DownloadPlan {
  const resolvedPlanFile = resolve(planFile);
  let raw: string;
  try {
    raw = readFileSync(resolvedPlanFile, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CraftpixDownloadError(`Could not read plan file ${resolvedPlanFile}: ${message}`);
  }

  try {
    return JSON.parse(raw) as DownloadPlan;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CraftpixDownloadError(`Plan file is not valid JSON: ${message}`);
  }
}

function validatePlan(plan: DownloadPlan): asserts plan is { defaults?: PlanDefaults; downloads: PlanItem[] } {
  if (!Array.isArray(plan.downloads) || plan.downloads.length === 0) {
    throw new CraftpixDownloadError("Plan file must include a non-empty downloads array.");
  }
}

async function main(): Promise<number> {
  try {
    const cli = parseArgs(process.argv.slice(2));
    const plan = readPlan(cli.planFile);
    validatePlan(plan);

    const defaults = plan.defaults ?? {};
    let failures = 0;

    for (let index = 0; index < plan.downloads.length; index += 1) {
      const item = plan.downloads[index];
      if (!item.sourceUrl) {
        throw new CraftpixDownloadError(`Plan item ${index + 1} is missing sourceUrl.`);
      }

      const resolveOnly = cli.forceResolveOnly || item.resolveOnly || defaults.resolveOnly || false;
      const overwrite = cli.forceOverwrite || item.overwrite || defaults.overwrite || false;
      const timeout = item.timeout ?? defaults.timeout ?? DEFAULT_TIMEOUT;
      if (!Number.isFinite(timeout) || timeout <= 0) {
        throw new CraftpixDownloadError(`Plan item ${index + 1} has an invalid timeout.`);
      }

      try {
        const result = await executeDownload({
          sourceUrl: item.sourceUrl,
          outputDir: item.outputDir ?? defaults.outputDir,
          cookieFile: item.cookieFile ?? defaults.cookieFile,
          filename: item.filename,
          subitem: item.subitem,
          resolveOnly,
          overwrite,
          timeout,
          debug: cli.debug || item.debug || defaults.debug || false,
        });

        if (resolveOnly) {
          console.log(`[${index + 1}/${plan.downloads.length}] ${item.sourceUrl} -> ${result.resolved.downloadUrl}`);
        } else {
          console.log(`[${index + 1}/${plan.downloads.length}] ${item.sourceUrl} -> ${result.destination}`);
        }
      } catch (error) {
        failures += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[${index + 1}/${plan.downloads.length}] ERROR: ${message}`);
        if (!cli.continueOnError) {
          return 1;
        }
      }
    }

    return failures > 0 ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR: ${message}`);
    return 1;
  }
}

void main().then((exitCode) => {
  process.exit(exitCode);
});
