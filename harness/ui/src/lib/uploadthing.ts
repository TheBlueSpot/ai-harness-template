import { genUploader } from "uploadthing/client";
import type { HarnessUploadRouter } from "../../../cli/src/uploadthing-router";

function createHarnessUploader() {
  return genUploader<HarnessUploadRouter>({
    url: typeof window === "undefined" ? "http://localhost/api/uploadthing" : `${window.location.origin}/api/uploadthing`
  });
}

export async function uploadFiles(...args: Parameters<ReturnType<typeof createHarnessUploader>["uploadFiles"]>) {
  return createHarnessUploader().uploadFiles(...args);
}
