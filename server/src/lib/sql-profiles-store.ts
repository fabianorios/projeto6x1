/**
 * File-backed SqlProfile store — DATA_DIR/sql-profiles.json (outside Git).
 * Factory default is always present and immutable.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  FACTORY_PROFILE_ID,
  FACTORY_PROFILE_NAME,
  factoryDefaultSlots,
} from "./sql-profile-defaults.js";
import {
  SQL_SLOT_IDS,
  type SqlProfile,
  type SqlProfileInput,
  type SqlProfileStoreFile,
  type SqlSlotId,
  type SqlSlotQueries,
} from "./sql-profile-types.js";

const STORE_FILE = "sql-profiles.json";

function factoryProfile(now = new Date().toISOString()): SqlProfile {
  return {
    id: FACTORY_PROFILE_ID,
    name: FACTORY_PROFILE_NAME,
    readonly: true,
    createdAt: now,
    updatedAt: now,
    slots: factoryDefaultSlots(),
  };
}

function emptyStore(): SqlProfileStoreFile {
  const factory = factoryProfile();
  return {
    version: 1,
    activeId: factory.id,
    profiles: [factory],
  };
}

function ensureFactory(data: SqlProfileStoreFile): SqlProfileStoreFile {
  const hasFactory = data.profiles.some((p) => p.id === FACTORY_PROFILE_ID);
  if (hasFactory) {
    // Keep factory slots/name immutable even if file was tampered.
    data.profiles = data.profiles.map((p) =>
      p.id === FACTORY_PROFILE_ID
        ? {
            ...p,
            name: FACTORY_PROFILE_NAME,
            readonly: true,
            slots: factoryDefaultSlots(),
          }
        : p,
    );
    return data;
  }
  const factory = factoryProfile();
  return {
    version: 1,
    activeId: data.activeId ?? factory.id,
    profiles: [factory, ...data.profiles],
  };
}

function validateSlots(
  slots: Record<string, SqlSlotQueries> | undefined,
): string | null {
  if (!slots || typeof slots !== "object") return "slots is required";
  for (const id of SQL_SLOT_IDS) {
    const q = slots[id];
    if (!q || typeof q.mssql !== "string" || typeof q.oracle !== "string") {
      return `slots.${id} must include mssql and oracle strings`;
    }
    if (!q.mssql.trim() || !q.oracle.trim()) {
      return `slots.${id} SQL cannot be empty`;
    }
  }
  return null;
}

export class SqlProfilesStore {
  private cache: SqlProfileStoreFile | null = null;

  constructor(private readonly dataDir: string) {}

  private filePath(): string {
    return join(this.dataDir, STORE_FILE);
  }

  async load(): Promise<SqlProfileStoreFile> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.filePath(), "utf8");
      const parsed = JSON.parse(raw) as SqlProfileStoreFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.profiles)) {
        throw new Error("invalid sql-profiles format");
      }
      this.cache = ensureFactory({
        version: 1,
        activeId: parsed.activeId ?? null,
        profiles: parsed.profiles,
      });
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

  private async persist(data: SqlProfileStoreFile): Promise<void> {
    await mkdir(dirname(this.filePath()), { recursive: true });
    const tmp = `${this.filePath()}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await rename(tmp, this.filePath());
    this.cache = data;
  }

  async list(): Promise<SqlProfile[]> {
    const data = await this.load();
    return data.profiles.map((p) => structuredClone(p));
  }

  async get(id: string): Promise<SqlProfile | null> {
    const data = await this.load();
    const found = data.profiles.find((p) => p.id === id);
    return found ? structuredClone(found) : null;
  }

  async getActive(): Promise<SqlProfile | null> {
    const data = await this.load();
    if (!data.activeId) return data.profiles[0] ?? null;
    return (
      data.profiles.find((p) => p.id === data.activeId) ??
      data.profiles[0] ??
      null
    );
  }

  async setActive(id: string): Promise<SqlProfile> {
    const data = await this.load();
    const found = data.profiles.find((p) => p.id === id);
    if (!found) throw new Error("profile not found");
    data.activeId = id;
    await this.persist(data);
    return structuredClone(found);
  }

  async create(input: SqlProfileInput): Promise<SqlProfile> {
    const name = input.name?.trim();
    if (!name) throw new Error("name is required");
    const slotErr = validateSlots(input.slots);
    if (slotErr) throw new Error(slotErr);

    const data = await this.load();
    const now = new Date().toISOString();
    const profile: SqlProfile = {
      id: randomUUID(),
      name,
      readonly: false,
      createdAt: now,
      updatedAt: now,
      slots: cloneSlots(input.slots),
    };
    data.profiles.push(profile);
    await this.persist(data);
    return structuredClone(profile);
  }

  async duplicate(
    sourceId: string,
    name?: string,
  ): Promise<SqlProfile> {
    const data = await this.load();
    const source = data.profiles.find((p) => p.id === sourceId);
    if (!source) throw new Error("profile not found");
    const now = new Date().toISOString();
    const profile: SqlProfile = {
      id: randomUUID(),
      name: (name?.trim() || `${source.name} (cópia)`).slice(0, 120),
      readonly: false,
      createdAt: now,
      updatedAt: now,
      slots: cloneSlots(source.slots),
    };
    data.profiles.push(profile);
    data.activeId = profile.id;
    await this.persist(data);
    return structuredClone(profile);
  }

  async update(
    id: string,
    input: Partial<SqlProfileInput>,
  ): Promise<SqlProfile> {
    const data = await this.load();
    const idx = data.profiles.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error("profile not found");
    const current = data.profiles[idx]!;
    if (current.readonly || current.id === FACTORY_PROFILE_ID) {
      throw new Error("factory profile is read-only — duplicate first");
    }

    const nextName =
      input.name !== undefined ? input.name.trim() : current.name;
    if (!nextName) throw new Error("name is required");

    let nextSlots = current.slots;
    if (input.slots) {
      const slotErr = validateSlots(input.slots);
      if (slotErr) throw new Error(slotErr);
      nextSlots = cloneSlots(input.slots);
    }

    const updated: SqlProfile = {
      ...current,
      name: nextName,
      slots: nextSlots,
      updatedAt: new Date().toISOString(),
      readonly: false,
    };
    data.profiles[idx] = updated;
    await this.persist(data);
    return structuredClone(updated);
  }

  async remove(id: string): Promise<void> {
    if (id === FACTORY_PROFILE_ID) {
      throw new Error("cannot delete factory profile");
    }
    const data = await this.load();
    const next = data.profiles.filter((p) => p.id !== id);
    if (next.length === data.profiles.length) {
      throw new Error("profile not found");
    }
    data.profiles = next;
    if (data.activeId === id) {
      data.activeId = FACTORY_PROFILE_ID;
    }
    await this.persist(data);
  }

  async getSlotSql(
    profileId: string,
    slot: SqlSlotId,
    dialect: "mssql" | "oracle",
  ): Promise<string> {
    const profile = await this.get(profileId);
    if (!profile) throw new Error("profile not found");
    return profile.slots[slot][dialect];
  }
}

function cloneSlots(
  slots: Record<SqlSlotId, SqlSlotQueries>,
): Record<SqlSlotId, SqlSlotQueries> {
  const out = {} as Record<SqlSlotId, SqlSlotQueries>;
  for (const id of SQL_SLOT_IDS) {
    out[id] = {
      mssql: slots[id].mssql,
      oracle: slots[id].oracle,
    };
  }
  return out;
}
