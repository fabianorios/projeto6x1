export type DbEngine = "mssql" | "oracle";

/** Stored record (password encrypted). */
export type EnvironmentRecord = {
  id: string;
  /** User-chosen label (generic — never hard-code client names). */
  name: string;
  engine: DbEngine;
  host: string;
  port: number;
  /** MSSQL database name, or Oracle service name. */
  database: string;
  user: string;
  /** AES-GCM ciphertext (base64). */
  passwordEnc: string;
  /** MSSQL TLS options */
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Public DTO — password never returned in clear. */
export type EnvironmentPublic = {
  id: string;
  name: string;
  engine: DbEngine;
  host: string;
  port: number;
  database: string;
  user: string;
  /** Always masked after save. */
  passwordMasked: string;
  hasPassword: boolean;
  encrypt: boolean;
  trustServerCertificate: boolean;
  createdAt: string;
  updatedAt: string;
  active: boolean;
};

export type EnvironmentStoreFile = {
  version: 1;
  activeId: string | null;
  environments: EnvironmentRecord[];
};

export type EnvironmentInput = {
  name: string;
  engine: DbEngine;
  host: string;
  port?: number;
  database: string;
  user: string;
  /** Required on create; omit/empty on update to keep existing. */
  password?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
};
