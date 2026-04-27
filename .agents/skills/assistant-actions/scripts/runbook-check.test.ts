import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { buildAssistantStateReport } from "./assistant-state";
import { validateRunbook } from "./runbook-check";

const skillRoot = path.resolve(import.meta.dir, "..");

describe("assistant-actions runbook", () => {
  test("master skill links all branch docs", () => {
    const result = validateRunbook(skillRoot);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.branchDocs).toContain("jobs.md");
  });

  test("every assistant story maps to a runbook branch", () => {
    const result = validateRunbook(skillRoot);

    expect(result.storyIds).toEqual([
      "US-ASSISTANTS-001",
      "US-ASSISTANTS-002",
      "US-ASSISTANTS-003",
      "US-ASSISTANTS-004"
    ]);
  });

  test("job-state lookup covers queued assistant jobs", () => {
    const dbPath = createAssistantStateFixture();
    const report = buildAssistantStateReport({
      dbPath,
      assistant: "Release watcher",
      project: "Docs",
      json: true,
      limit: 10
    }) as {
      lookup: { status: string };
      backgroundJobs: Array<{ name: string; status: string }>;
      backgroundJobRuns: Array<{ status: string; job_id: string }>;
    };

    expect(report.lookup.status).toBe("ok");
    expect(report.backgroundJobs).toEqual([
      expect.objectContaining({ name: "Release watcher routine", status: "enabled" })
    ]);
    expect(report.backgroundJobRuns).toEqual([
      expect.objectContaining({ status: "queued", job_id: "job-1" })
    ]);
  });
});

function createAssistantStateFixture() {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data", "assistant-actions");
  mkdirSync(tempRoot, { recursive: true });
  const dbPath = path.join(tempRoot, `assistant-actions-${crypto.randomUUID()}.sqlite`);
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        last_opened_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE assistants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        scope TEXT NOT NULL,
        project_id TEXT NULL,
        description TEXT NULL,
        agent_id TEXT NOT NULL,
        mode_id TEXT NULL,
        execution_model_id TEXT NULL,
        run_state TEXT NOT NULL,
        bootstrap_state TEXT NOT NULL,
        failure_streak_count INTEGER NOT NULL,
        circuit_breaker_state TEXT NOT NULL,
        circuit_breaker_reason TEXT NULL,
        latest_activity_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
      );
      CREATE TABLE assistant_threads (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        memory_summary_content TEXT NULL,
        memory_summary_updated_at TEXT NULL,
        updated_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE assistant_messages (
        id TEXT PRIMARY KEY,
        assistant_thread_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE assistant_todos (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NULL,
        state TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        blocker_reason TEXT NULL,
        source TEXT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE assistant_learnings (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE assistant_questions (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        answer_text TEXT NULL,
        asked_at TEXT NOT NULL,
        answered_at TEXT NULL
      );
      CREATE TABLE assistant_log_entries (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        level TEXT NOT NULL,
        summary TEXT NOT NULL,
        detail TEXT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE background_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        assistant_id TEXT NULL,
        automation_thread_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NULL,
        schedule_input TEXT NOT NULL,
        timezone TEXT NOT NULL,
        status TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        next_run_at TEXT NULL,
        last_run_at TEXT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE background_job_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        assistant_id TEXT NULL,
        trigger_source TEXT NOT NULL,
        status TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        approval_status TEXT NOT NULL,
        summary TEXT NULL,
        failure_message TEXT NULL,
        queued_at TEXT NULL,
        started_at TEXT NULL,
        completed_at TEXT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const now = "2026-04-27T12:00:00.000Z";
    db.query(`INSERT INTO projects VALUES (?1, ?2, ?3, ?4, ?4)`).run("project-1", "Docs", "C:/repo/docs", now);
    db.query(
      `INSERT INTO assistants VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`
    ).run(
      "assistant-1",
      "Release watcher",
      "project",
      "project-1",
      "Watches release notes",
      "pi",
      "implement",
      "openai/gpt-5.4",
      "active",
      "completed",
      0,
      "closed",
      null,
      now,
      now,
      null
    );
    db.query(`INSERT INTO assistant_threads VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`).run(
      "assistant-thread-1",
      "assistant-1",
      "session-1",
      "Tracks release notes.",
      now,
      now
    );
    db.query(`INSERT INTO background_jobs VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`).run(
      "job-1",
      "project-1",
      "assistant-1",
      "thread-automation",
      "ai-routine",
      "Release watcher routine",
      "Check releases",
      "every weekday",
      "America/New_York",
      "enabled",
      "low",
      "2026-04-28T12:00:00.000Z",
      null,
      now
    );
    db.query(`INSERT INTO background_job_runs VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`).run(
      "run-1",
      "job-1",
      "project-1",
      "assistant-1",
      "manual",
      "queued",
      "low",
      "approved",
      null,
      null,
      now,
      null,
      null,
      now
    );
  } finally {
    db.close();
  }
  return dbPath;
}
