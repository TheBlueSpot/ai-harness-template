import { Database } from "bun:sqlite";
import { mkdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import {
  agentRunStateSchema,
  chatMessageSchema,
  createEmptySession,
  createProjectId,
  createProjectThreadSummary,
  createRunId,
  createThreadId,
  type AgentRunState,
  type AgentRunStatus,
  type ChatMessage,
  type ChatRole,
  type PlannerReadyTurn,
  type PlanningChoice,
  type PlanningQuestion,
  type ProviderBrand,
  type ProjectId,
  type ProjectRootPath,
  type ProjectThreadSummary,
  type QuestionId,
  type SubagentTaskState,
  type ThreadBadgeState,
  type ThreadId,
  type WorkspaceProjectState,
  type WorkspaceState
} from "../../shared/protocol";
import { debugLog } from "./logging";

const ACTIVE_THREAD_STATUS = "active";
const ACTIVE_PROJECT_KEY = "active_project_id";
const OPENAI_API_KEY = "openai_api_key";
const GOOGLE_API_KEY = "google_api_key";
const PROVIDER_BRAND_KEY = "provider_brand";
const DEBUG_ENABLED_KEY = "debug_enabled";
const TRACE_PANEL_DEFAULT_OPEN_KEY = "trace_panel_default_open";

type ProjectRow = {
  id: string;
  name: string;
  root_path: string;
  active_thread_id: string | null;
  created_at: string;
  updated_at: string;
  last_opened_at: string;
};

type ThreadRow = {
  id: string;
  project_id: string;
  status: string;
  title: string;
  title_source: "generated" | "custom";
  updated_at: string;
  forked_from_thread_id: string | null;
  created_at: string;
  archived_at: string | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
};

type AgentRunRow = {
  id: string;
  project_id: string;
  thread_id: string;
  status: AgentRunStatus;
  latest_user_prompt: string;
  planning_model_id: string | null;
  execution_model_id: string | null;
  difficulty_score: number | null;
  summary: string | null;
  final_execution_brief: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type AgentRunQuestionRow = {
  id: string;
  run_id: string;
  ordinal: number;
  prompt: string;
  placeholder: string | null;
  choices_json: string | null;
  status: "pending" | "answered";
  answer_text: string | null;
  asked_at: string;
  answered_at: string | null;
};

type AgentRunSubtaskRow = {
  id: string;
  run_id: string;
  planner_task_id: string;
  title: string;
  instruction: string;
  status: "pending" | "running" | "completed" | "failed";
  attempt_count: number;
  output: string | null;
  error_message: string | null;
  commit_sha: string | null;
  worktree_path: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export class WorkspaceRepository {
  private readonly db: Database;
  private readonly dbPath: string;
  private readonly allowDevThreadRecovery: boolean;

  constructor(dbPath?: string, defaultRootPath: string = process.cwd()) {
    this.dbPath = dbPath ?? path.join(process.cwd(), ".local", "harness.db");
    this.allowDevThreadRecovery = Bun.env.NODE_ENV !== "production";
    mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath, { create: true, strict: true });
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
    this.bootstrapDefaultProject(defaultRootPath);
  }

  loadWorkspace(): WorkspaceState {
    const projectRows = this.db
      .query<ProjectRow, []>(
        `SELECT id, name, root_path, active_thread_id, created_at, updated_at, last_opened_at
         FROM projects
         ORDER BY last_opened_at DESC, created_at ASC`
      )
      .all();

    if (projectRows.length === 0) {
      throw new Error("Workspace bootstrap failed: no projects found");
    }

    const activeProjectId = this.resolveActiveProjectId(projectRows.map((project) => project.id as ProjectId));
    return {
      projects: projectRows.map((project) => this.readProjectSnapshot(project.id as ProjectId)),
      activeProjectId
    };
  }

  addProject(rootPath: string): WorkspaceProjectState {
    const normalizedRootPath = normalizeProjectRootPath(rootPath);
    ensureDirectoryExists(normalizedRootPath);

    const existingProject = this.db
      .query<ProjectRow, [string]>(
        `SELECT id, name, root_path, active_thread_id, created_at, updated_at, last_opened_at
         FROM projects
         WHERE root_path = ?1`
      )
      .get(normalizedRootPath);

    if (existingProject) {
      throw new Error(`Project already exists: ${normalizedRootPath}`);
    }

    const projectId = createProjectId();
    const threadId = createThreadId();
    const now = new Date().toISOString();
    const baseName = path.basename(normalizedRootPath);
    const uniqueName = this.resolveUniqueProjectName(baseName);

    const tx = this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO projects (id, name, root_path, active_thread_id, created_at, updated_at, last_opened_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?5)`
        )
        .run(projectId, uniqueName, normalizedRootPath, threadId, now);
      this.insertThread(projectId, threadId, {
        title: "Thread 1",
        titleSource: "generated",
        updatedAt: now
      });
      this.setWorkspaceMetaValue(ACTIVE_PROJECT_KEY, projectId);
    });
    tx();

    return this.readProjectSnapshot(projectId);
  }

  activateProject(projectId: ProjectId) {
    this.assertProjectExists(projectId);
    const now = new Date().toISOString();
    this.touchProject(projectId, now);
    this.setWorkspaceMetaValue(ACTIVE_PROJECT_KEY, projectId);
  }

  removeProject(projectId: ProjectId): { activeProjectId: ProjectId } {
    this.assertProjectExists(projectId);
    const remainingProjectIds = this.db
      .query<{ id: string }, [string]>(`SELECT id FROM projects WHERE id != ?1 ORDER BY last_opened_at DESC, created_at ASC`)
      .all(projectId)
      .map((project) => project.id as ProjectId);

    if (remainingProjectIds.length === 0) {
      throw new Error("At least one project must remain");
    }

    const nextActiveProjectId = remainingProjectIds[0];
    const tx = this.db.transaction(() => {
      this.db.query(`DELETE FROM projects WHERE id = ?1`).run(projectId);
      this.setWorkspaceMetaValue(ACTIVE_PROJECT_KEY, nextActiveProjectId);
    });
    tx();

    return { activeProjectId: nextActiveProjectId };
  }

  createThread(projectId: ProjectId) {
    this.assertProjectExists(projectId);
    const threadId = createThreadId();
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.insertThread(projectId, threadId, {
        title: `Thread ${this.getNextThreadNumber(projectId)}`,
        titleSource: "generated",
        updatedAt: now
      });
      this.setActiveThread(projectId, threadId, now);
    });
    tx();

    return this.readProjectSnapshot(projectId);
  }

  forkThread(projectId: ProjectId, sourceThreadId: ThreadId) {
    const sourceThread = this.readThreadRow(projectId, sourceThreadId);
    const nextThreadId = createThreadId();
    const now = new Date().toISOString();
    const sourceMessages = this.readMessages(sourceThread.id as ThreadId);

    const tx = this.db.transaction(() => {
      this.insertThread(projectId, nextThreadId, {
        title: `Fork of ${sourceThread.title}`,
        titleSource: "generated",
        updatedAt: now,
        forkedFromThreadId: sourceThread.id as ThreadId
      });

      for (const message of sourceMessages) {
        this.db
          .query(
            `INSERT INTO thread_messages (id, thread_id, role, content, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)`
          )
          .run(crypto.randomUUID(), nextThreadId, message.role, message.content, message.createdAt);
      }

      this.setActiveThread(projectId, nextThreadId, now);
    });
    tx();

    return this.readProjectSnapshot(projectId);
  }

  activateThread(projectId: ProjectId, threadId: ThreadId) {
    this.readThreadRow(projectId, threadId);
    this.setActiveThread(projectId, threadId, new Date().toISOString());
    return this.readProjectSnapshot(projectId);
  }

  renameThread(projectId: ProjectId, threadId: ThreadId, title: string) {
    const normalizedTitle = normalizeThreadTitle(title);
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE project_threads
         SET title = ?3, title_source = 'custom', updated_at = ?4
         WHERE id = ?1 AND project_id = ?2`
      )
      .run(threadId, projectId, normalizedTitle, now);

    if (updated.changes === 0) {
      throw new Error(`Unknown thread: ${threadId}`);
    }

    this.touchProject(projectId, now);
    return this.readProjectSnapshot(projectId);
  }

  listThreadSummaries(projectId: ProjectId) {
    this.assertProjectExists(projectId);
    return this.readThreadSummaries(projectId);
  }

  getThreadSummary(projectId: ProjectId, threadId: ThreadId) {
    return this.readThreadSummaries(projectId).find((thread) => thread.id === threadId);
  }

  resetProject(projectId: ProjectId) {
    return this.createThread(projectId);
  }

  appendMessage(projectId: ProjectId, role: ChatRole, content: string, threadId?: ThreadId): WorkspaceProjectState {
    const resolvedThreadId = this.resolveThreadId(projectId, threadId);
    const thread = this.readThreadRow(projectId, resolvedThreadId);
    const message = {
      id: crypto.randomUUID(),
      role,
      content,
      createdAt: new Date().toISOString()
    } satisfies ChatMessage;
    const priorMessageCount =
      this.db.query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM thread_messages WHERE thread_id = ?1`).get(thread.id)
        ?.count ?? 0;

    const tx = this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO thread_messages (id, thread_id, role, content, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`
        )
        .run(message.id, thread.id, message.role, message.content, message.createdAt);
      this.db.query(`UPDATE project_threads SET updated_at = ?2 WHERE id = ?1`).run(thread.id, message.createdAt);
      this.touchProject(projectId, message.createdAt);

      if (role === "user" && priorMessageCount === 0 && thread.title_source === "generated" && /^Thread \d+$/.test(thread.title)) {
        this.db
          .query(`UPDATE project_threads SET title = ?3 WHERE id = ?1 AND project_id = ?2`)
          .run(thread.id, projectId, toGeneratedThreadTitle(content, thread.title));
      }
    });
    tx();

    return this.readProjectSnapshot(projectId);
  }

  createAgentRun(projectId: ProjectId, latestUserPrompt: string, planningModelId?: string, threadId?: ThreadId) {
    const resolvedThreadId = this.resolveThreadId(projectId, threadId);
    this.readThreadRow(projectId, resolvedThreadId);
    const runId = createRunId();
    const now = new Date().toISOString();

    this.db
      .query(
        `INSERT INTO agent_runs (
          id,
          project_id,
          thread_id,
          status,
          latest_user_prompt,
          planning_model_id,
          execution_model_id,
          difficulty_score,
          summary,
          final_execution_brief,
          failure_message,
          created_at,
          updated_at,
          completed_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, NULL, NULL, NULL, ?7, ?7, NULL)`
      )
      .run(runId, projectId, resolvedThreadId, "planning", latestUserPrompt, planningModelId ?? null, now);

    this.db.query(`UPDATE project_threads SET updated_at = ?2 WHERE id = ?1`).run(resolvedThreadId, now);
    this.touchProject(projectId, now);
    return this.readProjectSnapshot(projectId);
  }

  appendPlanningQuestion(
    projectId: ProjectId,
    runId: string,
    question: Pick<PlanningQuestion, "id" | "prompt" | "placeholder" | "choices" | "required">
  ) {
    const now = new Date().toISOString();
    const ordinal =
      (this.db
        .query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM agent_run_questions WHERE run_id = ?1`)
        .get(runId)?.count ?? 0) + 1;

    const tx = this.db.transaction(() => {
      this.assertRunExists(projectId, runId);
      this.db
        .query(
          `INSERT INTO agent_run_questions (
            id,
            run_id,
            ordinal,
            prompt,
            placeholder,
            choices_json,
            status,
            answer_text,
            asked_at,
            answered_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', NULL, ?7, NULL)`
        )
        .run(question.id, runId, ordinal, question.prompt, question.placeholder ?? null, JSON.stringify(question.choices), now);

      this.db
        .query(
          `UPDATE agent_runs
           SET status = 'awaiting-user-input', summary = ?3, updated_at = ?4
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(runId, projectId, question.prompt, now);
    });
    tx();

    return this.readProjectSnapshot(projectId);
  }

  answerPlanningQuestion(projectId: ProjectId, runId: string, questionId: QuestionId, answerText: string) {
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE agent_run_questions
         SET status = 'answered', answer_text = ?4, answered_at = ?5
         WHERE id = ?1 AND run_id = ?2
           AND EXISTS (
             SELECT 1 FROM agent_runs
             WHERE agent_runs.id = ?2 AND agent_runs.project_id = ?3
           )`
      )
      .run(questionId, runId, projectId, answerText, now);

    if (updated.changes === 0) {
      throw new Error(`Unknown pending planning question: ${questionId}`);
    }

    this.db
      .query(
        `UPDATE agent_runs
         SET status = 'planning', updated_at = ?3
         WHERE id = ?1 AND project_id = ?2`
      )
      .run(runId, projectId, now);

    return this.readProjectSnapshot(projectId);
  }

  setAgentRunReady(projectId: ProjectId, runId: string, plan: PlannerReadyTurn, planningModelId?: string) {
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      this.assertRunExists(projectId, runId);
      this.db.query(`DELETE FROM agent_run_subtasks WHERE run_id = ?1`).run(runId);

      for (const task of plan.subtasks) {
        this.db
          .query(
            `INSERT INTO agent_run_subtasks (
              id,
              run_id,
              planner_task_id,
              title,
              instruction,
              status,
              attempt_count,
              output,
              error_message,
              started_at,
              completed_at,
              updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', 0, NULL, NULL, NULL, NULL, ?6)`
          )
          .run(crypto.randomUUID(), runId, task.id, task.title, task.instruction, now);
      }

      this.db
        .query(
          `UPDATE agent_runs
           SET status = 'ready',
               planning_model_id = COALESCE(?3, planning_model_id),
               execution_model_id = ?4,
               difficulty_score = ?5,
               summary = ?6,
               final_execution_brief = ?7,
               failure_message = NULL,
               updated_at = ?8
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(
          runId,
          projectId,
          planningModelId ?? null,
          plan.executionModelId,
          Math.round(plan.difficultyScore),
          plan.summary,
          plan.finalExecutionBrief,
          now
        );
    });
    tx();

    return this.readProjectSnapshot(projectId);
  }

  setAgentRunStatus(projectId: ProjectId, runId: string, status: AgentRunStatus, failureMessage?: string) {
    const now = new Date().toISOString();
    const completedAt = status === "completed" ? now : null;
    const updated = this.db
      .query(
        `UPDATE agent_runs
         SET status = ?3,
             failure_message = ?4,
             updated_at = ?5,
             completed_at = CASE WHEN ?6 IS NULL THEN completed_at ELSE ?6 END
         WHERE id = ?1 AND project_id = ?2`
      )
      .run(runId, projectId, status, failureMessage ?? null, now, completedAt);

    if (updated.changes === 0) {
      throw new Error(`Unknown agent run: ${runId}`);
    }

    return this.readProjectSnapshot(projectId);
  }

  markSubtaskStarted(projectId: ProjectId, runId: string, taskId: string, attemptCount: number) {
    return this.updateSubtask(projectId, runId, taskId, {
      status: "running",
      attemptCount,
      startedAt: new Date().toISOString(),
      completedAt: null,
      output: null,
      errorMessage: null
    });
  }

  markSubtaskCompleted(
    projectId: ProjectId,
    runId: string,
    taskId: string,
    output: string,
    attemptCount: number,
    commitSha?: string,
    worktreePath?: string
  ) {
    const now = new Date().toISOString();
    return this.updateSubtask(projectId, runId, taskId, {
      status: "completed",
      attemptCount,
      completedAt: now,
      output,
      errorMessage: null,
      commitSha: commitSha ?? null,
      worktreePath: worktreePath ?? null
    });
  }

  markSubtaskFailed(
    projectId: ProjectId,
    runId: string,
    taskId: string,
    errorMessage: string,
    attemptCount: number,
    worktreePath?: string
  ) {
    const now = new Date().toISOString();
    return this.updateSubtask(projectId, runId, taskId, {
      status: "failed",
      attemptCount,
      completedAt: now,
      output: null,
      errorMessage,
      commitSha: null,
      worktreePath: worktreePath ?? null
    });
  }

  clearAgentRun(projectId: ProjectId, runId: string) {
    const deleted = this.db
      .query(`DELETE FROM agent_runs WHERE id = ?1 AND project_id = ?2`)
      .run(runId, projectId);

    if (deleted.changes === 0) {
      throw new Error(`Unknown agent run: ${runId}`);
    }

    return this.readProjectSnapshot(projectId);
  }

  getProject(projectId: ProjectId): WorkspaceProjectState {
    return this.readProjectSnapshot(projectId);
  }

  getStoredOpenAiApiKey() {
    return this.getWorkspaceMetaValue(OPENAI_API_KEY);
  }

  getStoredGoogleApiKey() {
    return this.getWorkspaceMetaValue(GOOGLE_API_KEY);
  }

  setStoredOpenAiApiKey(apiKey: string) {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      throw new Error("OpenAI API key is required");
    }

    this.setWorkspaceMetaValue(OPENAI_API_KEY, normalizedKey);
  }

  clearStoredOpenAiApiKey() {
    this.deleteWorkspaceMetaValue(OPENAI_API_KEY);
  }

  setStoredGoogleApiKey(apiKey: string) {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      throw new Error("Google API key is required");
    }

    this.setWorkspaceMetaValue(GOOGLE_API_KEY, normalizedKey);
  }

  clearStoredGoogleApiKey() {
    this.deleteWorkspaceMetaValue(GOOGLE_API_KEY);
  }

  getProviderBrand() {
    const value = this.getWorkspaceMetaValue(PROVIDER_BRAND_KEY);
    return value === "gemini" ? "gemini" : "gpt";
  }

  setProviderBrand(providerBrand: ProviderBrand) {
    this.setWorkspaceMetaValue(PROVIDER_BRAND_KEY, providerBrand);
  }

  getDebugEnabledDefault() {
    return this.getWorkspaceMetaValue(DEBUG_ENABLED_KEY) === "true";
  }

  setDebugEnabledDefault(debugEnabled: boolean) {
    this.setWorkspaceMetaValue(DEBUG_ENABLED_KEY, String(debugEnabled));
  }

  getTracePanelDefaultOpen() {
    const value = this.getWorkspaceMetaValue(TRACE_PANEL_DEFAULT_OPEN_KEY);
    return value === undefined ? true : value === "true";
  }

  setTracePanelDefaultOpen(tracePanelDefaultOpen: boolean) {
    this.setWorkspaceMetaValue(TRACE_PANEL_DEFAULT_OPEN_KEY, String(tracePanelDefaultOpen));
  }

  private bootstrapDefaultProject(defaultRootPath: string) {
    const count = this.db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM projects`).get()?.count ?? 0;
    if (count > 0) {
      return;
    }

    const normalizedRootPath = normalizeProjectRootPath(defaultRootPath);
    ensureDirectoryExists(normalizedRootPath);

    const now = new Date().toISOString();
    const projectId = createProjectId();
    const threadId = createThreadId();
    const projectName = path.basename(normalizedRootPath);

    const tx = this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO projects (id, name, root_path, active_thread_id, created_at, updated_at, last_opened_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?5)`
        )
        .run(projectId, projectName, normalizedRootPath, threadId, now);
      this.insertThread(projectId, threadId, {
        title: "Thread 1",
        titleSource: "generated",
        updatedAt: now
      });
      this.db.query(`INSERT INTO workspace_meta (key, value) VALUES (?1, ?2)`).run(ACTIVE_PROJECT_KEY, projectId);
    });
    tx();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        active_thread_id TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_threads (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'archived')),
        title TEXT NULL,
        title_source TEXT NULL,
        updated_at TEXT NULL,
        forked_from_thread_id TEXT NULL,
        created_at TEXT NOT NULL,
        archived_at TEXT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS project_threads_project_status_idx
      ON project_threads(project_id, status);

      CREATE INDEX IF NOT EXISTS project_threads_project_updated_idx
      ON project_threads(project_id, updated_at DESC, created_at DESC);

      CREATE TABLE IF NOT EXISTS thread_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS thread_messages_thread_created_idx
      ON thread_messages(thread_id, created_at);

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN (
          'planning',
          'awaiting-user-input',
          'ready',
          'running-main',
          'running-subagents',
          'aggregating',
          'partial-complete',
          'completed',
          'stopped',
          'failed'
        )),
        latest_user_prompt TEXT NOT NULL,
        planning_model_id TEXT NULL,
        execution_model_id TEXT NULL,
        difficulty_score INTEGER NULL,
        summary TEXT NULL,
        final_execution_brief TEXT NULL,
        failure_message TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS agent_runs_project_thread_updated_idx
      ON agent_runs(project_id, thread_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS agent_run_questions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        prompt TEXT NOT NULL,
        placeholder TEXT NULL,
        choices_json TEXT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'answered')),
        answer_text TEXT NULL,
        asked_at TEXT NOT NULL,
        answered_at TEXT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS agent_run_questions_run_ordinal_idx
      ON agent_run_questions(run_id, ordinal ASC);

      CREATE TABLE IF NOT EXISTS agent_run_subtasks (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        planner_task_id TEXT NOT NULL,
        title TEXT NOT NULL,
        instruction TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        output TEXT NULL,
        error_message TEXT NULL,
        commit_sha TEXT NULL,
        worktree_path TEXT NULL,
        started_at TEXT NULL,
        completed_at TEXT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS agent_run_subtasks_run_planner_task_idx
      ON agent_run_subtasks(run_id, planner_task_id);
    `);

    this.addColumnIfMissing("projects", "active_thread_id", "TEXT NULL");
    this.addColumnIfMissing("project_threads", "title", "TEXT NULL");
    this.addColumnIfMissing("project_threads", "title_source", "TEXT NULL");
    this.addColumnIfMissing("project_threads", "updated_at", "TEXT NULL");
    this.addColumnIfMissing("project_threads", "forked_from_thread_id", "TEXT NULL");
    this.addColumnIfMissing("agent_run_questions", "choices_json", "TEXT NULL");
    this.addColumnIfMissing("agent_run_subtasks", "commit_sha", "TEXT NULL");
    this.addColumnIfMissing("agent_run_subtasks", "worktree_path", "TEXT NULL");

    this.db.exec(`DROP INDEX IF EXISTS project_threads_active_project_idx;`);
    this.db.exec(`UPDATE project_threads SET status = 'active' WHERE status = 'archived';`);

    this.backfillActiveThreadIds();
    this.backfillThreadMetadata();
    this.backfillQuestionChoices();
  }

  private readProjectSnapshot(projectId: ProjectId): WorkspaceProjectState {
    let attemptCount = 0;
    while (attemptCount < 8) {
      try {
        return this.readProjectSnapshotUnsafe(projectId);
      } catch (error) {
        if (!this.tryRecoverFromProjectLoadFailure(projectId, error)) {
          throw error;
        }
      }

      attemptCount += 1;
    }

    throw new Error(`Unable to recover project snapshot for ${projectId}`);
  }

  private readProjectSnapshotUnsafe(projectId: ProjectId): WorkspaceProjectState {
    const project = this.db
      .query<ProjectRow, [string]>(
        `SELECT id, name, root_path, active_thread_id, created_at, updated_at, last_opened_at
         FROM projects
         WHERE id = ?1`
      )
      .get(projectId);

    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    const activeThread = this.readActiveThreadRow(projectId);
    try {
      return {
        id: project.id as ProjectId,
        name: project.name,
        rootPath: project.root_path as ProjectRootPath,
        activeThreadId: activeThread.id as ThreadId,
        threads: this.readThreadSummaries(projectId),
        session: {
          ...createEmptySession(activeThread.id as ThreadId),
          messages: this.readMessages(activeThread.id as ThreadId)
        },
        activeRun: this.readActiveRun(projectId, activeThread.id as ThreadId),
        lastRun: this.readLatestRun(projectId, activeThread.id as ThreadId)
      };
    } catch (error) {
      throw new ThreadLoadError(projectId, activeThread.id as ThreadId, error);
    }
  }

  private readActiveThreadRow(projectId: ProjectId) {
    const activeThreadId = this.db
      .query<{ active_thread_id: string | null }, [string]>(`SELECT active_thread_id FROM projects WHERE id = ?1`)
      .get(projectId)?.active_thread_id;

    if (!activeThreadId) {
      throw new Error(`Project ${projectId} has no active thread`);
    }

    return this.readThreadRow(projectId, activeThreadId as ThreadId);
  }

  private readThreadRow(projectId: ProjectId, threadId: ThreadId) {
    const thread = this.db
      .query<ThreadRow, [string, string]>(
        `SELECT id, project_id, status, title, title_source, updated_at, forked_from_thread_id, created_at, archived_at
         FROM project_threads
         WHERE project_id = ?1 AND id = ?2`
      )
      .get(projectId, threadId);

    if (!thread) {
      throw new Error(`Unknown thread: ${threadId}`);
    }

    return thread;
  }

  private readMessages(threadId: ThreadId) {
    return this.db
      .query<MessageRow, [string]>(
        `SELECT id, thread_id, role, content, created_at
         FROM thread_messages
         WHERE thread_id = ?1
         ORDER BY created_at ASC`
      )
      .all(threadId)
      .map((message) =>
        chatMessageSchema.parse({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.created_at
        })
      );
  }

  private readThreadSummaries(projectId: ProjectId): ProjectThreadSummary[] {
    const threadRows = this.db
      .query<ThreadRow, [string]>(
        `SELECT id, project_id, status, title, title_source, updated_at, forked_from_thread_id, created_at, archived_at
         FROM project_threads
         WHERE project_id = ?1
         ORDER BY updated_at DESC, created_at DESC`
      )
      .all(projectId);

    return threadRows.map((thread) => {
      try {
        const latestRun = this.readLatestRun(projectId, thread.id as ThreadId);
        const preview =
          this.db
            .query<{ content: string }, [string]>(
              `SELECT content FROM thread_messages WHERE thread_id = ?1 ORDER BY created_at DESC LIMIT 1`
            )
            .get(thread.id)?.content ?? undefined;
        const messageCount =
          this.db.query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM thread_messages WHERE thread_id = ?1`).get(thread.id)
            ?.count ?? 0;

        return createProjectThreadSummary({
          id: thread.id as ThreadId,
          title: thread.title,
          titleSource: thread.title_source,
          badgeState: getThreadBadgeState(latestRun),
          messageCount,
          lastMessagePreview: preview ? summarizeMessagePreview(preview) : undefined,
          updatedAt: thread.updated_at,
          forkedFromThreadId: thread.forked_from_thread_id as ThreadId | undefined
        });
      } catch (error) {
        throw new ThreadLoadError(projectId, thread.id as ThreadId, error);
      }
    });
  }

  private tryRecoverFromProjectLoadFailure(projectId: ProjectId, error: unknown) {
    if (!this.allowDevThreadRecovery) {
      return false;
    }

    if (error instanceof ThreadLoadError) {
      this.deleteThreadForRecovery(projectId, error.threadId, error.cause);
      return true;
    }

    const activeThreadId = this.db
      .query<{ active_thread_id: string | null }, [string]>(`SELECT active_thread_id FROM projects WHERE id = ?1`)
      .get(projectId)?.active_thread_id;
    if (!activeThreadId) {
      this.ensureProjectHasUsableThread(projectId, new Date().toISOString());
      return true;
    }

    return false;
  }

  private assertProjectExists(projectId: ProjectId) {
    const project = this.db.query<{ id: string }, [string]>(`SELECT id FROM projects WHERE id = ?1`).get(projectId);
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }
  }

  private assertRunExists(projectId: ProjectId, runId: string) {
    const run = this.db
      .query<{ id: string }, [string, string]>(`SELECT id FROM agent_runs WHERE id = ?1 AND project_id = ?2`)
      .get(runId, projectId);

    if (!run) {
      throw new Error(`Unknown agent run: ${runId}`);
    }
  }

  private resolveActiveProjectId(projectIds: ProjectId[]) {
    const activeProjectId = this.db
      .query<{ value: string }, [string]>(`SELECT value FROM workspace_meta WHERE key = ?1`)
      .get(ACTIVE_PROJECT_KEY)?.value as ProjectId | undefined;

    if (activeProjectId && projectIds.includes(activeProjectId)) {
      return activeProjectId;
    }

    const fallbackProjectId = projectIds[0];
    this.activateProject(fallbackProjectId);
    return fallbackProjectId;
  }

  private resolveThreadId(projectId: ProjectId, threadId?: ThreadId) {
    return threadId ?? (this.readActiveThreadRow(projectId).id as ThreadId);
  }

  private readActiveRun(projectId: ProjectId, threadId: ThreadId): AgentRunState | undefined {
    const run = this.db
      .query<AgentRunRow, [string, string]>(
        `SELECT
          id, project_id, thread_id, status, latest_user_prompt, planning_model_id, execution_model_id,
          difficulty_score, summary, final_execution_brief, failure_message, created_at, updated_at, completed_at
         FROM agent_runs
         WHERE project_id = ?1 AND thread_id = ?2 AND status != 'completed'
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(projectId, threadId);

    return run ? this.hydrateRunState(run) : undefined;
  }

  private readLatestRun(projectId: ProjectId, threadId: ThreadId): AgentRunState | undefined {
    const run = this.db
      .query<AgentRunRow, [string, string]>(
        `SELECT
          id, project_id, thread_id, status, latest_user_prompt, planning_model_id, execution_model_id,
          difficulty_score, summary, final_execution_brief, failure_message, created_at, updated_at, completed_at
         FROM agent_runs
         WHERE project_id = ?1 AND thread_id = ?2
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(projectId, threadId);

    return run ? this.hydrateRunState(run) : undefined;
  }

  private hydrateRunState(run: AgentRunRow): AgentRunState {
    const questions = this.db
      .query<AgentRunQuestionRow, [string]>(
        `SELECT id, run_id, ordinal, prompt, placeholder, choices_json, status, answer_text, asked_at, answered_at
         FROM agent_run_questions
         WHERE run_id = ?1
         ORDER BY ordinal ASC`
      )
      .all(run.id)
      .map((question) => ({
        id: question.id,
        prompt: question.prompt,
        placeholder: question.placeholder ?? undefined,
        choices: parsePlanningChoices(question.choices_json),
        required: true,
        status: question.status,
        answerText: question.answer_text ?? undefined,
        askedAt: question.asked_at,
        answeredAt: question.answered_at ?? undefined
      }));

    const subtasks = this.db
      .query<AgentRunSubtaskRow, [string]>(
        `SELECT
          id, run_id, planner_task_id, title, instruction, status, attempt_count, output, error_message,
          commit_sha, worktree_path, started_at, completed_at, updated_at
         FROM agent_run_subtasks
         WHERE run_id = ?1
         ORDER BY planner_task_id ASC`
      )
      .all(run.id)
      .map((task) => ({
        id: task.planner_task_id,
        title: task.title,
        instruction: task.instruction,
        status: task.status,
        attemptCount: task.attempt_count,
        output: task.output ?? undefined,
        errorMessage: task.error_message ?? undefined,
        commitSha: task.commit_sha ?? undefined,
        worktreePath: task.worktree_path ?? undefined,
        startedAt: task.started_at ?? undefined,
        completedAt: task.completed_at ?? undefined,
        updatedAt: task.updated_at
      }));

    const hasExecutionState = subtasks.length > 0 || Boolean(run.final_execution_brief);
    return agentRunStateSchema.parse({
      id: run.id,
      threadId: run.thread_id as ThreadId,
      status: run.status,
      latestUserPrompt: run.latest_user_prompt,
      planningModelId: run.planning_model_id ?? undefined,
      executionModelId: run.execution_model_id ?? undefined,
      difficultyScore: run.difficulty_score ?? undefined,
      summary: run.summary ?? undefined,
      finalExecutionBrief: run.final_execution_brief ?? undefined,
      failureMessage: run.failure_message ?? undefined,
      questions,
      subtasks,
      resumable: isRunResumable(run.status, hasExecutionState),
      retryable: isRunRetryable(run.status, hasExecutionState),
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      completedAt: run.completed_at ?? undefined
    });
  }

  private getWorkspaceMetaValue(key: string) {
    return this.db
      .query<{ value: string }, [string]>(`SELECT value FROM workspace_meta WHERE key = ?1`)
      .get(key)?.value;
  }

  private setWorkspaceMetaValue(key: string, value: string) {
    this.db
      .query(
        `INSERT INTO workspace_meta (key, value)
         VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);
  }

  private deleteWorkspaceMetaValue(key: string) {
    this.db.query(`DELETE FROM workspace_meta WHERE key = ?1`).run(key);
  }

  private resolveUniqueProjectName(baseName: string) {
    const existingNames = new Set(
      this.db
        .query<{ name: string }, []>(`SELECT name FROM projects`)
        .all()
        .map((row) => row.name)
    );

    if (!existingNames.has(baseName)) {
      return baseName;
    }

    let suffix = 2;
    while (existingNames.has(`${baseName} (${suffix})`)) {
      suffix += 1;
    }

    return `${baseName} (${suffix})`;
  }

  private getNextThreadNumber(projectId: ProjectId) {
    const count =
      this.db.query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM project_threads WHERE project_id = ?1`).get(projectId)
        ?.count ?? 0;
    return count + 1;
  }

  private insertThread(
    projectId: ProjectId,
    threadId: ThreadId,
    input: { title: string; titleSource: "generated" | "custom"; updatedAt: string; forkedFromThreadId?: ThreadId }
  ) {
    this.db
      .query(
        `INSERT INTO project_threads (
          id, project_id, status, title, title_source, updated_at, forked_from_thread_id, created_at, archived_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?6, NULL)`
      )
      .run(threadId, projectId, ACTIVE_THREAD_STATUS, input.title, input.titleSource, input.updatedAt, input.forkedFromThreadId ?? null);
  }

  private setActiveThread(projectId: ProjectId, threadId: ThreadId, now: string) {
    this.db
      .query(
        `UPDATE projects
         SET active_thread_id = ?2, updated_at = ?3, last_opened_at = ?3
         WHERE id = ?1`
      )
      .run(projectId, threadId, now);
  }

  private touchProject(projectId: ProjectId, now: string) {
    this.db
      .query(
        `UPDATE projects
         SET updated_at = ?2, last_opened_at = ?2
         WHERE id = ?1`
      )
      .run(projectId, now);
  }

  private deleteThreadForRecovery(projectId: ProjectId, threadId: ThreadId, cause: unknown) {
    const now = new Date().toISOString();
    const message = cause instanceof Error ? cause.message : String(cause);
    debugLog("workspace.thread-recovery.delete", {
      projectId,
      threadId,
      reason: message
    });

    const tx = this.db.transaction(() => {
      this.db.query(`DELETE FROM project_threads WHERE id = ?1 AND project_id = ?2`).run(threadId, projectId);
      this.ensureProjectHasUsableThread(projectId, now);
    });
    tx();
  }

  private ensureProjectHasUsableThread(projectId: ProjectId, now: string) {
    const fallbackThread = this.db
      .query<{ id: string }, [string]>(
        `SELECT id
         FROM project_threads
         WHERE project_id = ?1
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`
      )
      .get(projectId);

    if (fallbackThread) {
      this.setActiveThread(projectId, fallbackThread.id as ThreadId, now);
      return;
    }

    const threadId = createThreadId();
    this.insertThread(projectId, threadId, {
      title: "Thread 1",
      titleSource: "generated",
      updatedAt: now
    });
    this.setActiveThread(projectId, threadId, now);
  }

  private backfillActiveThreadIds() {
    const projects = this.db.query<{ id: string; active_thread_id: string | null }, []>(`SELECT id, active_thread_id FROM projects`).all();
    for (const project of projects) {
      if (project.active_thread_id) {
        continue;
      }

      const threadId = this.db
        .query<{ id: string }, [string]>(
          `SELECT id
           FROM project_threads
           WHERE project_id = ?1
           ORDER BY created_at ASC
           LIMIT 1`
        )
        .get(project.id)?.id;

      if (threadId) {
        this.db.query(`UPDATE projects SET active_thread_id = ?2 WHERE id = ?1`).run(project.id, threadId);
      }
    }
  }

  private backfillThreadMetadata() {
    const projectIds = this.db.query<{ id: string }, []>(`SELECT id FROM projects`).all().map((project) => project.id);

    for (const projectId of projectIds) {
      const threads = this.db
        .query<ThreadRow, [string]>(
          `SELECT id, project_id, status, title, title_source, updated_at, forked_from_thread_id, created_at, archived_at
           FROM project_threads
           WHERE project_id = ?1
           ORDER BY created_at ASC`
        )
        .all(projectId);

      threads.forEach((thread, index) => {
        try {
          const firstUserMessage = this.db
            .query<{ content: string }, [string]>(
              `SELECT content FROM thread_messages WHERE thread_id = ?1 AND role = 'user' ORDER BY created_at ASC LIMIT 1`
            )
            .get(thread.id)?.content;
          const latestMessageAt = this.db
            .query<{ created_at: string }, [string]>(
              `SELECT created_at FROM thread_messages WHERE thread_id = ?1 ORDER BY created_at DESC LIMIT 1`
            )
            .get(thread.id)?.created_at;

          this.db
            .query(
              `UPDATE project_threads
               SET title = ?2, title_source = ?3, updated_at = ?4
               WHERE id = ?1`
            )
            .run(
              thread.id,
              normalizeThreadTitle(thread.title ?? toGeneratedThreadTitle(firstUserMessage, `Thread ${index + 1}`)),
              thread.title_source ?? "generated",
              thread.updated_at ?? latestMessageAt ?? thread.created_at
            );
        } catch (error) {
          if (!this.allowDevThreadRecovery) {
            throw error;
          }

          this.deleteThreadForRecovery(projectId as ProjectId, thread.id as ThreadId, error);
        }
      });
    }
  }

  private backfillQuestionChoices() {
    const rows = this.db
      .query<{ id: string; placeholder: string | null; choices_json: string | null }, []>(
        `SELECT id, placeholder, choices_json FROM agent_run_questions`
      )
      .all();

    for (const row of rows) {
      if (row.choices_json) {
        continue;
      }

      this.db
        .query(`UPDATE agent_run_questions SET choices_json = ?2 WHERE id = ?1`)
        .run(row.id, JSON.stringify(createFallbackPlanningChoices(row.placeholder ?? "Provide answer")));
    }
  }

  private updateSubtask(
    projectId: ProjectId,
    runId: string,
    taskId: string,
    input: {
      status: SubagentTaskState["status"];
      attemptCount: number;
      startedAt?: string | null;
      completedAt?: string | null;
      output?: string | null;
      errorMessage?: string | null;
      commitSha?: string | null;
      worktreePath?: string | null;
    }
  ) {
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE agent_run_subtasks
         SET status = ?4, attempt_count = ?5, started_at = COALESCE(?6, started_at), completed_at = ?7,
             output = ?8, error_message = ?9, commit_sha = ?10, worktree_path = ?11, updated_at = ?12
         WHERE run_id = ?1
           AND planner_task_id = ?2
           AND EXISTS (SELECT 1 FROM agent_runs WHERE agent_runs.id = ?1 AND agent_runs.project_id = ?3)`
      )
      .run(
        runId,
        taskId,
        projectId,
        input.status,
        input.attemptCount,
        input.startedAt ?? null,
        input.completedAt ?? null,
        input.output ?? null,
        input.errorMessage ?? null,
        input.commitSha ?? null,
        input.worktreePath ?? null,
        now
      );

    if (updated.changes === 0) {
      throw new Error(`Unknown agent subtask: ${taskId}`);
    }

    this.db.query(`UPDATE agent_runs SET updated_at = ?3 WHERE id = ?1 AND project_id = ?2`).run(runId, projectId, now);
    return this.readProjectSnapshot(projectId);
  }

  private addColumnIfMissing(tableName: string, columnName: string, definition: string) {
    const columns = this.db
      .query<{ name: string }, [string]>(`SELECT name FROM pragma_table_info(?1)`)
      .all(tableName)
      .map((row) => row.name);

    if (!columns.includes(columnName)) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }
}

function parsePlanningChoices(input: string | null): PlanningChoice[] {
  if (!input) {
    return createFallbackPlanningChoices("Provide answer");
  }

  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed) && parsed.length === 3) {
      return parsed as PlanningChoice[];
    }
  } catch {
    return createFallbackPlanningChoices("Provide answer");
  }

  return createFallbackPlanningChoices("Provide answer");
}

function createFallbackPlanningChoices(placeholder: string): PlanningChoice[] {
  return [
    { id: "choice-1", label: "Use example", description: "Send example answer.", answerText: placeholder, recommended: true },
    { id: "choice-2", label: "Confirm", description: "Send short confirmation.", answerText: placeholder, recommended: false },
    { id: "choice-3", label: "Custom", description: "Type custom answer.", answerText: placeholder, recommended: false }
  ];
}

function getThreadBadgeState(run?: AgentRunState): ThreadBadgeState {
  if (!run) {
    return "idle";
  }
  if (run.status === "failed" || run.status === "partial-complete") {
    return "error";
  }
  if (run.status === "awaiting-user-input") {
    return "needs-input";
  }
  if (run.status === "planning" || run.status === "ready") {
    return "planning";
  }
  if (run.status === "running-main" || run.status === "running-subagents" || run.status === "aggregating") {
    return "executing";
  }
  if (run.status === "completed") {
    return "done";
  }
  return "idle";
}

function summarizeMessagePreview(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

function normalizeThreadTitle(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new Error("Thread title is required");
  }

  return normalized.slice(0, 256);
}

function toGeneratedThreadTitle(content: string | undefined, fallback: string) {
  if (!content) {
    return fallback;
  }

  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ? normalizeThreadTitle(firstLine.slice(0, 256)) : fallback;
}

function isRunResumable(status: AgentRunStatus, hasExecutionState: boolean) {
  if (status === "partial-complete" || status === "stopped") {
    return true;
  }

  return status === "failed" ? hasExecutionState : false;
}

function isRunRetryable(status: AgentRunStatus, hasExecutionState: boolean) {
  if (status === "completed" || status === "partial-complete" || status === "stopped") {
    return true;
  }

  return status === "failed" ? hasExecutionState : false;
}

export function normalizeProjectRootPath(rootPath: string) {
  const trimmedPath = normalizeWindowsEscapedPath(rootPath.trim());
  if (!trimmedPath) {
    throw new Error("Project path is required");
  }

  if (!path.isAbsolute(trimmedPath)) {
    throw new Error("Project path must be absolute");
  }

  return realpathSync(trimmedPath);
}

export function normalizeWindowsEscapedPath(value: string) {
  if (/^[a-zA-Z]:\\\\/.test(value)) {
    return value.replace(/\\\\/g, "\\");
  }

  return value;
}

function ensureDirectoryExists(rootPath: string) {
  const stats = statSync(rootPath, { throwIfNoEntry: false });
  if (!stats || !stats.isDirectory()) {
    throw new Error(`Project path is not a directory: ${rootPath}`);
  }
}

class ThreadLoadError extends Error {
  readonly threadId: ThreadId;
  readonly cause: unknown;

  constructor(projectId: ProjectId, threadId: ThreadId, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to load thread ${threadId} for project ${projectId}: ${detail}`);
    this.threadId = threadId;
    this.cause = cause;
  }
}
