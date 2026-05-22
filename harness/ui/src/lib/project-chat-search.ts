import type { ViewProjectState } from "../harness-store";

export type ProjectChatSearchResult = {
  id: string;
  projectId: string;
  threadId?: string;
  title: string;
  preview: string;
};

export function buildProjectChatSearchResults(projects: ViewProjectState[], query: string): ProjectChatSearchResult[] {
  const tokens = tokenizeSearch(query);
  if (tokens.length === 0) {
    return [];
  }
  const projectHits = projects
    .filter((project) => tokens.every((token) => project.name.toLowerCase().includes(token) || project.rootPath.toLowerCase().includes(token)))
    .map((project) => ({
      id: `project:${project.id}`,
      projectId: project.id,
      title: project.name,
      preview: project.rootPath
    }));
  const transcriptHits = projects.flatMap((project) => {
    const activeThread = project.threads.find((thread) => thread.id === project.activeThreadId);
    return project.session.messages
      .filter((message) => tokens.every((token) => `${message.role} ${message.content}`.toLowerCase().includes(token)))
      .slice(-8)
      .reverse()
      .map((message, index) => ({
        id: `message:${project.id}:${activeThread?.id ?? project.activeThreadId}:${message.id ?? index}`,
        projectId: project.id,
        threadId: activeThread?.id ?? project.activeThreadId,
        title: `${project.name} / ${activeThread?.title ?? "Active thread"}`,
        preview: `${message.role}: ${message.content.replace(/\s+/g, " ").slice(0, 180)}`
      }));
  });
  return [...projectHits, ...transcriptHits].slice(0, 24);
}

function tokenizeSearch(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}
