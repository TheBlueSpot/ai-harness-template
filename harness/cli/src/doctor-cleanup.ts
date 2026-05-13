import { rm } from "node:fs/promises";
import path from "node:path";

export async function deleteDoctorDistFolder(cwd = process.cwd()) {
  await rm(path.resolve(cwd, "dist"), { recursive: true, force: true });
}
