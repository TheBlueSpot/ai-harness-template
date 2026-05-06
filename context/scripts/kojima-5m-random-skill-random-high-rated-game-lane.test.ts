import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import {
  buildKojima5mRandomSkillRandomHighRatedGamePrompt,
  upsertKojima5mRandomSkillRandomHighRatedGameJob,
} from "./kojima-5m-random-skill-random-high-rated-game-lane";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && existsSync(dir)) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

function createHarnessTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "kojima-5m-random-skill-random-high-rated-game-lane-"));
  tempDirs.push(dir);
  const dbPath = join(dir, "harness.db");
  const db = new Database(dbPath, { create: true, strict: true });

  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL UNIQUE,
      active_thread_id TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_opened_at TEXT NOT NULL,
      selected_mode_id TEXT NULL,
      rules_content TEXT NULL,
      rules_updated_at TEXT NULL
    );
    CREATE TABLE assistants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scope TEXT NOT NULL,
      project_id TEXT NULL,
      description TEXT NULL,
      personality_prompt TEXT NOT NULL,
      job_prompt TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      mode_id TEXT NULL,
      execution_model_id TEXT NULL,
      run_state TEXT NOT NULL,
      bootstrap_state TEXT NOT NULL,
      cloned_from_assistant_id TEXT NULL,
      failure_streak_count INTEGER NOT NULL DEFAULT 0,
      circuit_breaker_state TEXT NOT NULL DEFAULT 'closed',
      circuit_breaker_reason TEXT NULL,
      pending_reprioritize_reason TEXT NULL,
      pending_reprioritize_requested_at TEXT NULL,
      deleted_at TEXT NULL,
      latest_activity_at TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      provider_brand TEXT NULL,
      fast_mode INTEGER NULL,
      bootstrap_attempt_id TEXT NULL,
      bootstrap_started_at TEXT NULL,
      bootstrap_finished_at TEXT NULL
    );
    CREATE TABLE project_threads (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NULL,
      title_source TEXT NULL,
      updated_at TEXT NULL,
      forked_from_thread_id TEXT NULL,
      created_at TEXT NOT NULL,
      archived_at TEXT NULL,
      memory_summary_content TEXT NULL,
      memory_summary_updated_at TEXT NULL,
      kind TEXT NOT NULL DEFAULT 'user'
    );
    CREATE TABLE background_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      assistant_id TEXT NULL,
      automation_thread_id TEXT NOT NULL,
      template_id TEXT NULL,
      created_from_run_id TEXT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NULL,
      definition_json TEXT NOT NULL,
      schedule_json TEXT NOT NULL,
      schedule_input TEXT NOT NULL,
      timezone TEXT NULL,
      status TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      next_run_at TEXT NULL,
      last_run_at TEXT NULL,
      last_enqueued_at TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.query(
    `INSERT INTO projects (id, name, root_path, active_thread_id, created_at, updated_at, last_opened_at)
     VALUES (?1, 'context', 'C:/repo/context', NULL, ?2, ?2, ?2)`,
  ).run("project-1", "2026-04-30T12:00:00.000Z");
  db.query(
    `INSERT INTO assistants (
      id, name, scope, project_id, description, personality_prompt, job_prompt, agent_id,
      mode_id, execution_model_id, run_state, bootstrap_state, cloned_from_assistant_id,
      failure_streak_count, circuit_breaker_state, circuit_breaker_reason, pending_reprioritize_reason,
      pending_reprioritize_requested_at, deleted_at, latest_activity_at, created_at, updated_at
    ) VALUES (
      'assistant-1', 'Kojima', 'project', 'project-1', NULL, 'persona', 'job', 'codex-cli',
      'implement', NULL, 'active', 'completed', NULL, 0, 'closed', NULL, NULL, NULL, NULL, NULL, ?1, ?1
    )`,
  ).run("2026-04-30T12:00:00.000Z");

  return db;
}

function createSkill(root: string, name: string) {
  const dir = resolve(root, ".agents", "skills", name);
  mkdirSync(dir, { recursive: true });
}

describe("prompt", () => {
  test("mentions the selected skill and game", () => {
    const prompt = buildKojima5mRandomSkillRandomHighRatedGamePrompt("catalog-sweep", "bloons-pop");

    expect(prompt).toContain("5-minute random-skill lane");
    expect(prompt).toContain("catalog-sweep");
    expect(prompt).toContain("bloons-pop");
  });
});

describe("job sync", () => {
  test("upserts the 5m Kojima lane and stores a random 3+ star game with a random skill", () => {
    const db = createHarnessTestDb();
    const repoDir = mkdtempSync(join(tmpdir(), "kojima-5m-random-skill-random-high-rated-game-lane-repo-"));
    tempDirs.push(repoDir);
    createSkill(repoDir, "catalog-sweep");
    createSkill(repoDir, "playtest-evidence-capture");
    createSkill(repoDir, "failure-loop-audit");

    const reviews = {
      alpha: { broken: "", dislikes: "", likes: "", rating: 3, updatedAt: "2026-04-29T12:00:00.000Z" },
      beta: { broken: "", dislikes: "", likes: "", rating: 5, updatedAt: "2026-04-29T12:00:00.000Z" },
      gamma: { broken: "", dislikes: "", likes: "", rating: 2, updatedAt: "2026-04-29T12:00:00.000Z" },
    };

    try {
      const first = upsertKojima5mRandomSkillRandomHighRatedGameJob(db, {
        gameReviews: reviews,
        now: new Date("2026-04-30T12:00:00.000Z"),
        random: () => 0.74,
        skillNames: ["catalog-sweep", "failure-loop-audit", "playtest-evidence-capture"],
      });

      expect(first.created).toBe(true);
      expect(first.scheduleInput).toBe("5m");
      expect(first.nextRunAt).toBe("2026-04-30T12:05:00.000Z");
      expect(["alpha", "beta"]).toContain(first.gameSlug);
      expect(["catalog-sweep", "failure-loop-audit", "playtest-evidence-capture"]).toContain(first.skillName);

      const job = db
        .query<{ name: string; description: string; schedule_input: string; definition_json: string; schedule_json: string; timezone: string }, [string]>(
          "SELECT name, description, schedule_input, definition_json, schedule_json, timezone FROM background_jobs WHERE id = ?1",
        )
        .get(first.jobId);

      expect(job?.name).toBe("Kojima: 5m random skill on a high-rated game");
      expect(job?.description).toContain("random 3+ star game");
      expect(job?.schedule_input).toBe("5m");
      expect(job?.timezone).toBe("America/New_York");
      expect(job?.definition_json).toContain(first.gameSlug);
      expect(job?.definition_json).toContain(first.skillName);
      expect(job?.schedule_json).toContain("\"intervalSeconds\":300");

      const second = upsertKojima5mRandomSkillRandomHighRatedGameJob(db, {
        gameReviews: reviews,
        now: new Date("2026-04-30T12:01:00.000Z"),
        random: () => 0.74,
        skillNames: ["catalog-sweep", "failure-loop-audit", "playtest-evidence-capture"],
      });

      expect(second.created).toBe(false);
      expect(second.jobId).toBe(first.jobId);
      expect(second.nextRunAt).toBe("2026-04-30T12:05:00.000Z");
    } finally {
      db.close();
    }
  });
});
