/**
 * File-backed store for client environments.
 * Passwords encrypted at rest with ENCRYPTION_KEY.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret, maskPassword } from "./crypto.js";
import type {
  EnvironmentInput,
  EnvironmentPublic,
  EnvironmentRecord,
  EnvironmentStoreFile,
} from "./types.js";

const STORE_FILE = "environments.json";

function emptyStore(): EnvironmentStoreFile {
  return { version: 1, activeId: null, environments: [] };
}

function defaultPort(engine: "mssql" | "oracle", port?: number): number {
  if (port !== undefined && Number.isFinite(port) && port > 0) return port;
  return engine === "oracle" ? 1521 : 1433;
}

export class EnvironmentStore {
  private cache: EnvironmentStoreFile | null = null;

  constructor(
    private readonly dataDir: string,
    private readonly encryptionKey: Buffer,
  ) {}

  private filePath(): string {
    return join(this.dataDir, STORE_FILE);
  }

  async load(): Promise<EnvironmentStoreFile> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.filePath(), "utf8");
      const parsed = JSON.parse(raw) as EnvironmentStoreFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.environments)) {
        throw new Error("invalid store format");
      }
      this.cache = {
        version: 1,
        activeId: parsed.activeId ?? null,
        environments: parsed.environments,
      };
      return this.cache;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        this.cache = emptyStore();
        return this.cache;
      }
      throw err;
    }
  }

  private async persist(data: EnvironmentStoreFile): Promise<void> {
    await mkdir(dirname(this.filePath()), { recursive: true });
    const tmp = `${this.filePath()}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await rename(tmp, this.filePath());
    this.cache = data;
  }

  toPublic(record: EnvironmentRecord, activeId: string | null): EnvironmentPublic {
    return {
      id: record.id,
      name: record.name,
      engine: record.engine,
      host: record.host,
      port: record.port,
      database: record.database,
      user: record.user,
      passwordMasked: maskPassword(Boolean(record.passwordEnc)),
      hasPassword: Boolean(record.passwordEnc),
      encrypt: record.encrypt !== false,
      trustServerCertificate: Boolean(record.trustServerCertificate),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      active: activeId === record.id,
    };
  }

  async list(): Promise<EnvironmentPublic[]> {
    const data = await this.load();
    return data.environments.map((e) => this.toPublic(e, data.activeId));
  }

  async get(id: string): Promise<EnvironmentPublic | null> {
    const data = await this.load();
    const found = data.environments.find((e) => e.id === id);
    return found ? this.toPublic(found, data.activeId) : null;
  }

  async getRecord(id: string): Promise<EnvironmentRecord | null> {
    const data = await this.load();
    return data.environments.find((e) => e.id === id) ?? null;
  }

  async getActiveId(): Promise<string | null> {
    const data = await this.load();
    return data.activeId;
  }

  async getActive(): Promise<EnvironmentPublic | null> {
    const data = await this.load();
    if (!data.activeId) return null;
    const found = data.environments.find((e) => e.id === data.activeId);
    return found ? this.toPublic(found, data.activeId) : null;
  }

  decryptPassword(record: EnvironmentRecord): string {
    if (!record.passwordEnc) return "";
    return decryptSecret(record.passwordEnc, this.encryptionKey);
  }

  private validateInput(input: EnvironmentInput, requirePassword: boolean): string | null {
    if (!input.name?.trim()) return "name is required";
    if (input.engine !== "mssql" && input.engine !== "oracle") {
      return "engine must be mssql or oracle";
    }
    if (!input.host?.trim()) return "host is required";
    if (!input.database?.trim()) return "database is required";
    if (!input.user?.trim()) return "user is required";
    if (requirePassword && !input.password) return "password is required";
    return null;
  }

  async create(input: EnvironmentInput): Promise<EnvironmentPublic> {
    const err = this.validateInput(input, true);
    if (err) throw new Error(err);

    const data = await this.load();
    const now = new Date().toISOString();
    const record: EnvironmentRecord = {
      id: randomUUID(),
      name: input.name.trim(),
      engine: input.engine,
      host: input.host.trim(),
      port: defaultPort(input.engine, input.port),
      database: input.database.trim(),
      user: input.user.trim(),
      passwordEnc: encryptSecret(input.password!, this.encryptionKey),
      encrypt: input.encrypt !== false,
      trustServerCertificate: Boolean(input.trustServerCertificate),
      createdAt: now,
      updatedAt: now,
    };
    data.environments.push(record);
    if (!data.activeId) data.activeId = record.id;
    await this.persist(data);
    return this.toPublic(record, data.activeId);
  }

  async update(
    id: string,
    input: Partial<EnvironmentInput>,
  ): Promise<EnvironmentPublic> {
    const data = await this.load();
    const idx = data.environments.findIndex((e) => e.id === id);
    if (idx < 0) throw new Error("environment not found");

    const current = data.environments[idx]!;
    const engine = input.engine ?? current.engine;
    if (engine !== "mssql" && engine !== "oracle") {
      throw new Error("engine must be mssql or oracle");
    }

    const nextName = input.name !== undefined ? input.name.trim() : current.name;
    const nextHost = input.host !== undefined ? input.host.trim() : current.host;
    const nextDb =
      input.database !== undefined ? input.database.trim() : current.database;
    const nextUser = input.user !== undefined ? input.user.trim() : current.user;

    if (!nextName || !nextHost || !nextDb || !nextUser) {
      throw new Error("name, host, database and user are required");
    }

    let passwordEnc = current.passwordEnc;
    if (input.password !== undefined && input.password.length > 0) {
      passwordEnc = encryptSecret(input.password, this.encryptionKey);
    }

    const updated: EnvironmentRecord = {
      ...current,
      name: nextName,
      engine,
      host: nextHost,
      port: defaultPort(engine, input.port ?? current.port),
      database: nextDb,
      user: nextUser,
      passwordEnc,
      encrypt:
        input.encrypt !== undefined ? input.encrypt !== false : current.encrypt !== false,
      trustServerCertificate:
        input.trustServerCertificate !== undefined
          ? Boolean(input.trustServerCertificate)
          : Boolean(current.trustServerCertificate),
      updatedAt: new Date().toISOString(),
    };
    data.environments[idx] = updated;
    await this.persist(data);
    return this.toPublic(updated, data.activeId);
  }

  async remove(id: string): Promise<boolean> {
    const data = await this.load();
    const before = data.environments.length;
    data.environments = data.environments.filter((e) => e.id !== id);
    if (data.environments.length === before) return false;
    if (data.activeId === id) {
      data.activeId = data.environments[0]?.id ?? null;
    }
    await this.persist(data);
    return true;
  }

  async setActive(id: string): Promise<EnvironmentPublic> {
    const data = await this.load();
    const found = data.environments.find((e) => e.id === id);
    if (!found) throw new Error("environment not found");
    data.activeId = id;
    await this.persist(data);
    return this.toPublic(found, data.activeId);
  }
}
