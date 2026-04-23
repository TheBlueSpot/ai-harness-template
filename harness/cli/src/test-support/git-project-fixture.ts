import { afterAll, beforeAll } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { copyFile, lstat, mkdir, readdir, readlink, rm, symlink } from "node:fs/promises";
import path from "node:path";

type SeededGitProjectFixtureOptions = {
  fixtureName: string;
  packageName: string;
  readmeTitle: string;
  gitIgnore?: string;
  extraFiles?: Array<{
    relativePath: string;
    content: string;
  }>;
};

type SeededGitProjectFixture = {
  createRepoClone: (name: string) => Promise<string>;
  createTempDir: (name: string) => string;
  createTempPath: (name: string) => string;
  getTemplateRoot: () => string;
};

export function useGitProjectFixture(options: SeededGitProjectFixtureOptions): SeededGitProjectFixture {
  const fixtureRoot = path.join(process.cwd(), ".tmp-test-data", `fx-${crypto.randomUUID()}`);
  const templateRoot = path.join(fixtureRoot, "tpl");

  beforeAll(async () => {
    await mkdir(fixtureRoot, { recursive: true });
    seedBunProject(templateRoot, options);
    initializeGitRepo(templateRoot);
  });

  afterAll(async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rm(fixtureRoot, { recursive: true, force: true });
        return;
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EBUSY") {
          throw error;
        }
        if (attempt === 4) {
          return;
        }
        await Bun.sleep(100);
      }
    }
  });

  return {
    async createRepoClone(name: string) {
      const targetRoot = path.join(fixtureRoot, `repo-${crypto.randomUUID()}`);
      await copyRecursiveRobust(templateRoot, targetRoot);
      return targetRoot;
    },
    createTempDir(name: string) {
      const targetRoot = path.join(fixtureRoot, `dir-${crypto.randomUUID()}`);
      mkdirSync(targetRoot, { recursive: true });
      return targetRoot;
    },
    createTempPath(name: string) {
      const extension = path.extname(name);
      return path.join(fixtureRoot, `file-${crypto.randomUUID()}${extension}`);
    },
    getTemplateRoot() {
      return templateRoot;
    }
  };
}

function seedBunProject(rootPath: string, options: SeededGitProjectFixtureOptions) {
  mkdirSync(rootPath, { recursive: true });
  writeFileSync(
    path.join(rootPath, "package.json"),
    JSON.stringify(
      {
        name: options.packageName,
        private: true,
        type: "module",
        scripts: {
          typecheck: "bun --version",
          test: "bun --version"
        }
      },
      null,
      2
    )
  );
  writeFileSync(path.join(rootPath, ".gitignore"), options.gitIgnore ?? ".local\n");
  writeFileSync(path.join(rootPath, "README.md"), options.readmeTitle);
  writeFileSync(path.join(rootPath, "bun.lock"), "");

  for (const file of options.extraFiles ?? []) {
    const targetPath = path.join(rootPath, file.relativePath);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, file.content);
  }
}

function initializeGitRepo(rootPath: string) {
  runSync(["git", "init"], rootPath);
  runSync(["git", "config", "user.name", "Test User"], rootPath);
  runSync(["git", "config", "user.email", "test@example.com"], rootPath);
  runSync(["git", "add", "."], rootPath);
  runSync(["git", "commit", "-m", "init"], rootPath);
}

function runSync(command: string[], cwd: string) {
  const proc = Bun.spawnSync({
    cmd: command,
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });

  if (proc.exitCode !== 0) {
    const stdout = new TextDecoder().decode(proc.stdout);
    const stderr = new TextDecoder().decode(proc.stderr);
    throw new Error(`${command.join(" ")} failed: ${(stderr || stdout).trim()}`);
  }
}

async function copyRecursiveRobust(sourcePath: string, targetPath: string) {
  const sourceStats = await withFsRetry(() => lstat(sourcePath));
  if (sourceStats.isSymbolicLink()) {
    const linkTarget = await withFsRetry(() => readlink(sourcePath));
    await mkdir(path.dirname(targetPath), { recursive: true });
    await withFsRetry(() => symlink(linkTarget, targetPath, "junction"));
    return;
  }

  if (sourceStats.isDirectory()) {
    await mkdir(targetPath, { recursive: true });
    const entries = await withFsRetry(() => readdir(sourcePath, { withFileTypes: true }));
    for (const entry of entries) {
      await copyRecursiveRobust(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    }
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await withFsRetry(async () => {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  });
}

async function withFsRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || !["ENOENT", "EBUSY", "EPERM", "EACCES"].includes(String(error.code)) || attempt === 3) {
        throw error;
      }
      await Bun.sleep(25 * (attempt + 1));
    }
  }
  throw new Error("unreachable");
}
