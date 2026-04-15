import { z } from "zod";
import { isSupportedChatAttachment, MAX_CHAT_ATTACHMENT_COUNT } from "../../shared/chat-attachments";
import { UploadThingError, createUploadthing, type FileRouter } from "uploadthing/server";

const f = createUploadthing();

const documentRouteConfig = {
  maxFileSize: "16MB" as const,
  maxFileCount: MAX_CHAT_ATTACHMENT_COUNT
};

export const harnessUploadRouter = {
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
    .middleware(async ({ files }) => {
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
        uploadedAt: new Date().toISOString()
      };
    })
    .onUploadComplete(async ({ metadata, file }) => ({
      uploadedAt: metadata.uploadedAt,
      key: file.key,
      url: file.ufsUrl
    }))
} satisfies FileRouter;

export type HarnessUploadRouter = typeof harnessUploadRouter;
