import {
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";

export class JsonlOfflineQueue<T> {
  private operation: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly maxItems = 50_000,
  ) {}

  private runExclusive<Result>(operation: () => Promise<Result>) {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async readLines() {
    try {
      const content = await readFile(this.filePath, "utf8");
      return content.split(/\r?\n/).filter(Boolean);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  append(item: T) {
    return this.runExclusive(async () => {
      const existing = await this.readLines();
      if (existing.length >= this.maxItems) {
        throw new Error(
          `Offline queue limit reached (${this.maxItems} samples).`,
        );
      }

      await mkdir(dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, `${JSON.stringify(item)}\n`, "utf8");
    });
  }

  peek(limit: number) {
    return this.runExclusive(async () => {
      const queueLines = await this.readLines();
      return queueLines.slice(0, limit).map((line) => JSON.parse(line) as T);
    });
  }

  acknowledge(count: number) {
    return this.runExclusive(async () => {
      if (count <= 0) {
        return;
      }

      const queueLines = await this.readLines();
      const remaining = queueLines.slice(count);
      const temporaryPath = `${this.filePath}.tmp`;
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(
        temporaryPath,
        remaining.length > 0 ? `${remaining.join("\n")}\n` : "",
        "utf8",
      );
      await rm(this.filePath, { force: true });
      await rename(temporaryPath, this.filePath);
    });
  }

  size() {
    return this.runExclusive(async () => (await this.readLines()).length);
  }
}
