import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  buildExtensionCandidates,
  buildCatalogBuilderExtensionJobPrompt,
  createSeededRandom,
  defaultExtensionLaneState,
  detectWantingMoreSentiment,
  EXTENSION_JOB_10M_DESCRIPTION,
  EXTENSION_JOB_10M_INTERVAL_SECONDS,
  EXTENSION_JOB_10M_NAME,
  EXTENSION_JOB_10M_SCHEDULE_INPUT,
  getRepeatPenalty,
  pickWeightedCandidate,
  recordExtensionSelection,
  selectCatalogBuilderExtensionCandidate,
  upsertCatalogBuilderExtensionJob,
  type ReviewEntry,
} from "./catalog-builder-extension-lane";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && existsSync(dir)) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

function makeReview(partial: Partial<ReviewEntry> = {}): ReviewEntry {
  return {
    broken: "",
    dislikes: "",
    likes: "",
    rating: 4,
    updatedAt: "2026-04-30T12:00:00.000Z",
    ...partial,
  };
}

function createHarnessTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "catalog-builder-extension-lane-"));
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
      updated_at TEXT NOT NULL,
      scheduler_status TEXT NULL,
      scheduler_detail TEXT NULL,
      last_scheduler_check_at TEXT NULL,
      last_blocked_at TEXT NULL,
      blocked_reason TEXT NULL,
      scheduler_queue_position INTEGER NULL,
      scheduler_queue_reason TEXT NULL,
      scheduler_blocked_since_at TEXT NULL,
      scheduler_active_run_id TEXT NULL,
      scheduler_active_run_started_at TEXT NULL,
      scheduler_last_progress_at TEXT NULL,
      scheduler_overloaded INTEGER NULL
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
      'assistant-1', 'Catalog builder', 'project', 'project-1', NULL, 'persona', 'job', 'codex-cli',
      'implement', NULL, 'active', 'completed', NULL, 0, 'closed', NULL, NULL, NULL, NULL, NULL, ?1, ?1
    )`,
  ).run("2026-04-30T12:00:00.000Z");

  return db;
}

describe("detectWantingMoreSentiment", () => {
  test("matches clear wanting-more phrases across review text", () => {
    const heuristic = detectWantingMoreSentiment(
      makeReview({
        dislikes: "needs at least 5 levels of this. more mechanics and secret paths",
        likes: "best game in the catalog",
      }),
    );

    expect(heuristic.matched).toBe(true);
    expect(heuristic.score).toBeGreaterThanOrEqual(7);
    expect(heuristic.matches.map((entry) => entry.label)).toContain("needs levels");
    expect(heuristic.matches.map((entry) => entry.label)).toContain("more mechanics");
  });

  test("does not match praise without expansion ask", () => {
    const heuristic = detectWantingMoreSentiment(
      makeReview({
        likes: "great mechanics, tight controls, awesome ui",
        dislikes: "none",
      }),
    );

    expect(heuristic.matched).toBe(false);
    expect(heuristic.score).toBe(0);
  });
});

describe("buildExtensionCandidates", () => {
  test("filters to high-rated wanting-more reviews and ignores needsAdditionalFeedback for selection", () => {
    const reviews = {
      "age-evolution": makeReview({
        dislikes: "needs a story and more content",
        needsAdditionalFeedback: true,
        rating: 4,
      }),
      breakout: makeReview({
        dislikes: "hud",
        rating: 4,
      }),
      asteroids: makeReview({
        dislikes: "game needs to be 10x longer with levels",
        rating: 3,
      }),
    };

    const candidates = buildExtensionCandidates(reviews, { now: new Date("2026-04-30T12:00:00.000Z") });

    expect(candidates.map((entry) => entry.slug)).toEqual(["age-evolution"]);
  });

  test("applies freshness and updatedAt weighting", () => {
    const reviews = {
      fresh: makeReview({
        dislikes: "more levels and more variety",
        updatedAt: "2026-04-30T11:30:00.000Z",
      }),
      stale: makeReview({
        dislikes: "more levels and more variety",
        updatedAt: "2026-04-01T11:30:00.000Z",
      }),
    };

    const [fresh, stale] = buildExtensionCandidates(reviews, { now: new Date("2026-04-30T12:00:00.000Z") });

    expect(fresh.slug).toBe("fresh");
    expect(fresh.freshnessMultiplier).toBe(1.2);
    expect(fresh.recencyMultiplier).toBeGreaterThan(stale.recencyMultiplier);
    expect(fresh.weight).toBeGreaterThan(stale.weight);
  });

  test("applies anti-repeat penalty without eliminating candidates", () => {
    const state = defaultExtensionLaneState();
    recordExtensionSelection("bionic-swing", {
      selectedAt: new Date("2026-04-30T10:30:00.000Z"),
      state,
    });

    const reviews = {
      "bionic-swing": makeReview({
        dislikes: "need at least 5 levels of this. more mechanics",
        rating: 5,
      }),
      "bubble-cluster": makeReview({
        dislikes: "could use more powerups",
        rating: 5,
      }),
    };

    const candidates = buildExtensionCandidates(reviews, {
      now: new Date("2026-04-30T12:00:00.000Z"),
      state,
    });
    const repeated = candidates.find((entry) => entry.slug === "bionic-swing");
    const alternate = candidates.find((entry) => entry.slug === "bubble-cluster");

    expect(repeated?.repeatPenalty).toBeLessThan(1);
    expect(repeated?.weight).toBeGreaterThan(0);
    expect(alternate?.weight).toBeGreaterThan(repeated?.weight ?? 0);
  });
});

describe("selection", () => {
  test("supports deterministic seeded or mocked random selection", () => {
    const candidates = [
      { slug: "alpha", weight: 2 },
      { slug: "beta", weight: 3 },
      { slug: "gamma", weight: 5 },
    ] as Array<{
      slug: string;
      weight: number;
    }>;

    expect(pickWeightedCandidate(candidates as never[], () => 0)?.slug).toBe("alpha");
    expect(pickWeightedCandidate(candidates as never[], () => 0.49)?.slug).toBe("beta");
    expect(pickWeightedCandidate(candidates as never[], () => 0.99)?.slug).toBe("gamma");
  });

  test("selectCatalogBuilderExtensionCandidate uses seeded randomness", () => {
    const reviews = {
      "age-evolution": makeReview({
        dislikes: "needs a story and more content",
        updatedAt: "2026-04-30T11:55:00.000Z",
      }),
      "bionic-swing": makeReview({
        dislikes: "need at least 5 levels of this. more mechanics",
        rating: 5,
        updatedAt: "2026-04-30T11:58:00.000Z",
      }),
      "tower-hologram": makeReview({
        dislikes: "more variety in enemies and bosses",
        updatedAt: "2026-04-30T11:59:00.000Z",
      }),
    };

    const result = selectCatalogBuilderExtensionCandidate({
      now: new Date("2026-04-30T12:00:00.000Z"),
      random: createSeededRandom(7),
      reviews,
      state: defaultExtensionLaneState(),
    });

    expect(result.selected).not.toBeNull();
    expect(result.candidates.length).toBe(3);
    expect(["age-evolution", "bionic-swing", "tower-hologram"]).toContain(result.selected?.slug);
  });
});

describe("job sync", () => {
  test("registers the 15m Catalog Builder extension job and updates in place", () => {
    const db = createHarnessTestDb();
    const first = upsertCatalogBuilderExtensionJob(db, {
      now: new Date("2026-04-30T12:00:00.000Z"),
    });

    expect(first.created).toBe(true);
    expect(first.name).toBe("Catalog builder: wanting-more extension lane");
    expect(first.scheduleInput).toBe("15m");
    expect(first.nextRunAt).toBe("2026-04-30T12:15:00.000Z");

    const job = db
      .query<{ name: string; schedule_input: string; definition_json: string; schedule_json: string; timezone: string }, [string]>(
        "SELECT name, schedule_input, definition_json, schedule_json, timezone FROM background_jobs WHERE id = ?1",
      )
      .get(first.jobId);
    expect(job?.name).toBe(first.name);
    expect(job?.schedule_input).toBe("15m");
    expect(job?.timezone).toBe("America/New_York");
    expect(job?.definition_json).toContain("catalog-builder-extension-lane.ts select --json");
    expect(job?.definition_json).toContain("selector intentionally uses all reviews");
    expect(job?.schedule_json).toContain("\"intervalSeconds\":900");

    const second = upsertCatalogBuilderExtensionJob(db, {
      now: new Date("2026-04-30T12:01:00.000Z"),
    });

    expect(second.created).toBe(false);
    expect(second.jobId).toBe(first.jobId);
    expect(second.nextRunAt).toBe("2026-04-30T12:15:00.000Z");
    db.close();
  });

  test("registers a 10m copy with the same prompt but distinct cadence and name", () => {
    const db = createHarnessTestDb();
    const result = upsertCatalogBuilderExtensionJob(db, {
      description: EXTENSION_JOB_10M_DESCRIPTION,
      intervalSeconds: EXTENSION_JOB_10M_INTERVAL_SECONDS,
      jobName: EXTENSION_JOB_10M_NAME,
      now: new Date("2026-04-30T12:00:00.000Z"),
      scheduleInput: EXTENSION_JOB_10M_SCHEDULE_INPUT,
    });

    expect(result.created).toBe(true);
    expect(result.name).toBe(EXTENSION_JOB_10M_NAME);
    expect(result.scheduleInput).toBe("10m");
    expect(result.nextRunAt).toBe("2026-04-30T12:10:00.000Z");

    const job = db
      .query<{ name: string; description: string; schedule_input: string; definition_json: string; schedule_json: string }, [string]>(
        "SELECT name, description, schedule_input, definition_json, schedule_json FROM background_jobs WHERE id = ?1",
      )
      .get(result.jobId);
    expect(job?.name).toBe(EXTENSION_JOB_10M_NAME);
    expect(job?.description).toBe(EXTENSION_JOB_10M_DESCRIPTION);
    expect(job?.schedule_input).toBe("10m");
    expect(job?.definition_json).toContain("catalog-builder-extension-lane.ts select --json");
    expect(job?.schedule_json).toContain("\"intervalSeconds\":600");
    expect(job?.schedule_json).toContain("\"sourceText\":\"10m\"");
    db.close();
  });

  test("documents the selector and testing flow in the generated job prompt", () => {
    const prompt = buildCatalogBuilderExtensionJobPrompt();
    expect(prompt).toContain("separate wanting-more extension lane");
    expect(prompt).toContain("Thoroughly test the changed game");
    expect(prompt).toContain("uses all reviews");
    expect(prompt).toContain("record --slug <slug>");
  });

  test("repeat penalty decays over time", () => {
    const state = defaultExtensionLaneState();
    recordExtensionSelection("slug", {
      selectedAt: new Date("2026-04-30T10:00:00.000Z"),
      state,
    });

    const nearPenalty = getRepeatPenalty("slug", state, new Date("2026-04-30T12:00:00.000Z"));
    const farPenalty = getRepeatPenalty("slug", state, new Date("2026-05-04T12:00:00.000Z"));

    expect(nearPenalty).toBeLessThan(1);
    expect(farPenalty).toBe(1);
  });
});
