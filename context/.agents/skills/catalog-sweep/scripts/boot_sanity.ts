import { readFileSync } from "node:fs";

export type BootIssueCode = "missing-boot-script" | "inline-script-syntax" | "script-syntax";

export type BootIssue = {
  code: BootIssueCode;
  detail: string;
};

const JS_TRANSPILER = new Bun.Transpiler({ loader: "js" });

export function inspectInlineBootScripts(htmlPath: string): BootIssue[] {
  const html = readFileSync(htmlPath, "utf8");
  const issues: BootIssue[] = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let scriptCount = 0;
  let inlineIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(html)) !== null) {
    scriptCount += 1;
    const attrs = match[1] ?? "";
    const source = match[2] ?? "";
    const hasSrc = /\bsrc=["'][^"']+["']/i.test(attrs);
    if (hasSrc || source.trim().length === 0) {
      continue;
    }

    inlineIndex += 1;
    const mode = /\btype=["']module["']/i.test(attrs) ? "module" : "classic";
    try {
      JS_TRANSPILER.transformSync(source);
    } catch (error) {
      issues.push({
        code: "inline-script-syntax",
        detail: `inline ${mode} script ${inlineIndex} has syntax error: ${formatParseError(error)}`,
      });
    }
  }

  if (scriptCount === 0) {
    issues.push({
      code: "missing-boot-script",
      detail: "index.html has no script tag, so direct browser boot has no local code entrypoint",
    });
  }

  return issues;
}

export function inspectScriptSyntax(relativePath: string, source: string): BootIssue[] {
  try {
    JS_TRANSPILER.transformSync(source);
    return [];
  } catch (error) {
    return [
      {
        code: "script-syntax",
        detail: `${relativePath} has syntax error: ${formatParseError(error)}`,
      },
    ];
  }
}

function formatParseError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return String(error);
}
