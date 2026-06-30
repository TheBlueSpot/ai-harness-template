import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { runAssistantMaintenance } from "./assistant-maintenance";
import { buildAssistantJobsReport } from "./assistant-jobs";
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

  test("recent job lookup covers project job runs", () => {
    const dbPath = createAssistantStateFixture();
    const report = buildAssistantJobsReport({
      dbPath,
      project: "Docs",
      json: true,
      limit: 5
    }) as {
      lookup: { status: string };
      recentRuns: Array<{ status: string; job_id: string; assistant_name: string; project_name: string }>;
    };

    expect(report.lookup.status).toBe("ok");
    expect(report.recentRuns).toEqual([
      expect.objectContaining({
        status: "queued",
        job_id: "job-1",
        assistant_name: "Release watcher",
        project_name: "Docs"
      })
    ]);
  });

  test("maintenance removes all jobs for one assistant", () => {
    const dbPath = createAssistantMaintenanceFixture();

    const dryRun = runAssistantMaintenance({
      dbPath,
      action: "remove-jobs",
      assistant: "Release watcher",
      project: "Docs",
      execute: false,
      json: true
    }) as { plan: { backgroundJobCount: number; activeRunCount: number }; applied: boolean };

    expect(dryRun.applied).toBe(false);
    expect(dryRun.plan.backgroundJobCount).toBe(1);
    expect(dryRun.plan.activeRunCount).toBe(1);

    runAssistantMaintenance({
      dbPath,
      action: "remove-jobs",
      assistant: "Release watcher",
      project: "Docs",
      execute: true,
      json: true
    });

    const db = new Database(dbPath);
    try {
      expect((db.query(`SELECT COUNT(*) AS count FROM background_jobs WHERE assistant_id = ?1`).get("assistant-1") as { count: number }).count).toBe(0);
      expect((db.query(`SELECT status FROM background_job_runs WHERE id = ?1`).get("run-1") as { status: string }).status).toBe("cancelled");
      expect((db.query(`SELECT deleted_at FROM assistants WHERE id = ?1`).get("assistant-1") as { deleted_at: string | null }).deleted_at).toBeNull();
    } finally {
      db.close();
    }
  });

  test("maintenance removes project assistants without deleting globals", () => {
    const dbPath = createAssistantMaintenanceFixture();

    runAssistantMaintenance({
      dbPath,
      action: "remove-project-assistants",
      project: "Docs",
      execute: true,
      json: true
    });

    const db = new Database(dbPath);
    try {
      const projectAssistant = db.query(`SELECT deleted_at FROM assistants WHERE id = ?1`).get("assistant-1") as { deleted_at: string | null };
      const globalAssistant = db.query(`SELECT deleted_at FROM assistants WHERE id = ?1`).get("assistant-global") as { deleted_at: string | null };
      expect(projectAssistant.deleted_at).toBeTruthy();
      expect(globalAssistant.deleted_at).toBeNull();
      expect((db.query(`SELECT COUNT(*) AS count FROM background_jobs WHERE assistant_id = ?1`).get("assistant-1") as { count: number }).count).toBe(0);
    } finally {
      db.close();
    }
  });

  test("maintenance reboots all project assistants", () => {
    const dbPath = createAssistantMaintenanceFixture();

    runAssistantMaintenance({
      dbPath,
      action: "rebootstrap",
      project: "Docs",
      execute: true,
      json: true
    });

    const db = new Database(dbPath);
    try {
      const assistant = db
        .query(
          `SELECT bootstrap_state, run_state, failure_streak_count, circuit_breaker_state, circuit_breaker_reason
           FROM assistants WHERE id = ?1`
        )
        .get("assistant-1") as {
        bootstrap_state: string;
        run_state: string;
        failure_streak_count: number;
        circuit_breaker_state: string;
        circuit_breaker_reason: string | null;
      };
      expect(assistant.bootstrap_state).toBe("pending");
      expect(assistant.run_state).toBe("active");
      expect(assistant.failure_streak_count).toBe(0);
      expect(assistant.circuit_breaker_state).toBe("closed");
      expect(assistant.circuit_breaker_reason).toBeNull();
      expect((db.query(`SELECT COUNT(*) AS count FROM background_jobs WHERE assistant_id = ?1`).get("assistant-1") as { count: number }).count).toBe(1);
    } finally {
      db.close();
    }
  });

  test("maintenance pauses all project assistants without pausing globals", () => {
    const dbPath = createAssistantMaintenanceFixture();
    const setupDb = new Database(dbPath);
    setupDb.query(`UPDATE assistants SET run_state = 'active' WHERE id = ?1`).run("assistant-1");
    setupDb.close();

    const dryRun = runAssistantMaintenance({
      dbPath,
      action: "pause-assistants",
      project: "Docs",
      execute: false,
      json: true
    }) as { plan: { assistantsToPauseCount: number }; applied: boolean };

    expect(dryRun.applied).toBe(false);
    expect(dryRun.plan.assistantsToPauseCount).toBe(1);

    runAssistantMaintenance({
      dbPath,
      action: "pause-assistants",
      project: "Docs",
      execute: true,
      json: true
    });

    const db = new Database(dbPath);
    try {
      expect((db.query(`SELECT run_state FROM assistants WHERE id = ?1`).get("assistant-1") as { run_state: string }).run_state).toBe("paused");
      expect((db.query(`SELECT run_state FROM assistants WHERE id = ?1`).get("assistant-global") as { run_state: string }).run_state).toBe("active");
    } finally {
      db.close();
    }
  });

  test("maintenance resumes all project assistants and marks reprioritize", () => {
    const dbPath = createAssistantMaintenanceFixture();

    const dryRun = runAssistantMaintenance({
      dbPath,
      action: "resume-assistants",
      project: "Docs",
      execute: false,
      json: true
    }) as { plan: { assistantsToResumeCount: number }; applied: boolean };

    expect(dryRun.applied).toBe(false);
    expect(dryRun.plan.assistantsToResumeCount).toBe(1);

    runAssistantMaintenance({
      dbPath,
      action: "resume-assistants",
      project: "Docs",
      execute: true,
      json: true
    });

    const db = new Database(dbPath);
    try {
      const assistant = db
        .query(`SELECT run_state, pending_reprioritize_reason FROM assistants WHERE id = ?1`)
        .get("assistant-1") as { run_state: string; pending_reprioritize_reason: string | null };
      expect(assistant.run_state).toBe("active");
      expect(assistant.pending_reprioritize_reason).toBe("manual-resume");
      expect((db.query(`SELECT run_state FROM assistants WHERE id = ?1`).get("assistant-global") as { run_state: string }).run_state).toBe("active");
    } finally {
      db.close();
    }
  });

  test("maintenance plans all assistant jobs and skips active runs", () => {
    const dbPath = createAssistantMaintenanceFixture();

    const blockedByActiveRun = runAssistantMaintenance({
      dbPath,
      action: "start-jobs",
      assistant: "Release watcher",
      project: "Docs",
      execute: false,
      json: true
    }) as { plan: { backgroundJobCount: number; activeRunCount: number; jobsToStartCount: number } };

    expect(blockedByActiveRun.plan.backgroundJobCount).toBe(1);
    expect(blockedByActiveRun.plan.activeRunCount).toBe(1);
    expect(blockedByActiveRun.plan.jobsToStartCount).toBe(0);

    const db = new Database(dbPath);
    db.query(`UPDATE background_job_runs SET status = 'succeeded', completed_at = updated_at WHERE id = ?1`).run("run-1");
    db.close();

    const plan = runAssistantMaintenance({
      dbPath,
      action: "start-jobs",
      assistant: "Release watcher",
      project: "Docs",
      execute: false,
      json: true
    }) as { plan: { jobsToStartCount: number; jobsToStart: Array<{ id: string }> } };

    expect(plan.plan.jobsToStartCount).toBe(1);
    expect(plan.plan.jobsToStart).toEqual([expect.objectContaining({ id: "job-1" })]);
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

function createAssistantMaintenanceFixture() {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data", "assistant-actions");
  mkdirSync(tempRoot, { recursive: true });
  const dbPath = path.join(tempRoot, `assistant-maintenance-${crypto.randomUUID()}.sqlite`);
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
        run_state TEXT NOT NULL,
        bootstrap_state TEXT NOT NULL,
        bootstrap_attempt_id TEXT NULL,
        bootstrap_started_at TEXT NULL,
        bootstrap_finished_at TEXT NULL,
        failure_streak_count INTEGER NOT NULL,
        circuit_breaker_state TEXT NOT NULL,
        circuit_breaker_reason TEXT NULL,
        pending_reprioritize_reason TEXT NULL,
        pending_reprioritize_requested_at TEXT NULL,
        deleted_at TEXT NULL,
        latest_activity_at TEXT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE background_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        assistant_id TEXT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE background_job_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        assistant_id TEXT NULL,
        status TEXT NOT NULL,
        failure_message TEXT NULL,
        completed_at TEXT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const now = "2026-04-27T12:00:00.000Z";
    db.query(`INSERT INTO projects VALUES (?1, ?2, ?3, ?4, ?4)`).run("project-1", "Docs", "C:/repo/docs", now);
    db.query(`INSERT INTO assistants VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`).run(
      "assistant-1",
      "Release watcher",
      "project",
      "project-1",
      "paused",
      "failed",
      "attempt-old",
      now,
      now,
      3,
      "tripped",
      "Failed repeatedly",
      "failure",
      now,
      null,
      now,
      now
    );
    db.query(`INSERT INTO assistants VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`).run(
      "assistant-global",
      "Global watcher",
      "global",
      null,
      "active",
      "completed",
      null,
      null,
      now,
      0,
      "closed",
      null,
      null,
      null,
      null,
      now,
      now
    );
    db.query(`INSERT INTO background_jobs VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).run(
      "job-1",
      "project-1",
      "assistant-1",
      "Release watcher routine",
      "enabled",
      now
    );
    db.query(`INSERT INTO background_job_runs VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).run(
      "run-1",
      "job-1",
      "project-1",
      "assistant-1",
      "queued",
      null,
      null,
      now
    );
  } finally {
    db.close();
  }
  return dbPath;
}
