import { z } from "zod";
import { detectSupportedChatAttachment, isSupportedChatAttachment, MAX_CHAT_ATTACHMENT_COUNT } from "../../shared/chat-attachments";
import type { ChatAttachment } from "../../shared/protocol";
import type { WorkspaceRepository } from "./workspace-repository";
import { UploadThingError, createUploadthing, type FileRouter } from "uploadthing/server";

const f = createUploadthing();

const documentRouteConfig = {
  maxFileSize: "16MB" as const,
  maxFileCount: MAX_CHAT_ATTACHMENT_COUNT
};

export function createHarnessUploadRouter(repository: WorkspaceRepository) {
  return {
    chatAttachment: f(
      {
        image: {
          maxFileSize: "8MB",
          maxFileCount: MAX_CHAT_ATTACHMENT_COUNT
        },
        text: {
          maxFileSize: "256KB",
          maxFileCount: MAX_CHAT_ATTACHMENT_COUNT
        },
        pdf: documentRouteConfig,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": documentRouteConfig,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": documentRouteConfig,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": documentRouteConfig,
        "application/vnd.oasis.opendocument.text": documentRouteConfig,
        // Keep `blob` as a compatibility fallback for text-like files with odd browser MIME reporting.
        blob: documentRouteConfig
      },
      { awaitServerData: true }
    )
      .input(
        z.object({
          projectId: z.string().min(1).max(128).optional(),
          threadId: z.string().min(1).max(128).optional()
        })
      )
      .middleware(async ({ files, input }) => {
        for (const file of files) {
          const validation = isSupportedChatAttachment({
            name: file.name,
            mimeType: file.type,
            sizeBytes: file.size
          });
          if (!validation.ok) {
            throw new UploadThingError(validation.reason);
          }
        }

        return {
          uploadedAt: new Date().toISOString(),
          projectId: input.projectId,
          threadId: input.threadId
        };
      })
      .onUploadComplete(async ({ metadata, file }) => {
        const detectedAttachment = detectSupportedChatAttachment({ name: file.name, mimeType: file.type });
        if (detectedAttachment) {
          const attachment = {
            id: file.key,
            kind: detectedAttachment.kind,
            documentType: detectedAttachment.kind === "document" ? detectedAttachment.documentType : undefined,
            name: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            key: file.key,
            url: file.ufsUrl,
            uploadedAt: metadata.uploadedAt
          } satisfies ChatAttachment;
          repository.saveChatAttachmentUpload({
            projectId: metadata.projectId,
            threadId: metadata.threadId,
            attachment
          });
        }

        return {
          uploadedAt: metadata.uploadedAt,
          key: file.key,
          url: file.ufsUrl
        };
      })
  } satisfies FileRouter;
}

export type HarnessUploadRouter = ReturnType<typeof createHarnessUploadRouter>;
