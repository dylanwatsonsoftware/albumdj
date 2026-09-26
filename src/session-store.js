import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function createJsonSessionStore(filePath) {
  return {
    load() {
      try {
        return JSON.parse(readFileSync(filePath, "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },

    save(session) {
      mkdirSync(dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.tmp`;
      writeFileSync(temporaryPath, JSON.stringify(session), { mode: 0o600 });
      renameSync(temporaryPath, filePath);
    },
  };
}
