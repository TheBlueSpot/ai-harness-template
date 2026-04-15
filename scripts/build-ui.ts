import { buildUiBundle } from "../harness/cli/src/ui-build";

const minify = process.argv.includes("--minify");

if (minify) {
  console.log("[Production Mode Enabled] Minifying UI...");
} else {
  console.log("[Dev Mode Enabled]");
}

await buildUiBundle({ minify });
