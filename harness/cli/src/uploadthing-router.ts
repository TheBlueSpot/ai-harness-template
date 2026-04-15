import { z } from "zod";
import {
  isSupportedChatAttachment,
  MAX_CHAT_ATTACHMENT_COUNT,
  MAX_CHAT_ATTACHMENT_IMAGE_BYTES
} from "../../shared/chat-attachments";
import { UploadThingError, createUploadthing, type FileRouter } from "uploadthing/server";

const f = createUploadthing();

export const harnessUploadRouter = {
  chatAttachment: f(
    {
      blob: {
        maxFileSize: "8MB",
        maxFileCount: MAX_CHAT_ATTACHMENT_COUNT
      }
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
