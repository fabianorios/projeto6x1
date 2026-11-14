export type QueryParam = string | number | boolean | null | Date;

export type ColumnInfo = {
  name: string;
  dataType: string;
  maxLength: number | null;
  nullable: boolean;
  defaultValue: string | null;
};

export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
};

export interface DbClient {
  readonly driver: "mssql" | "oracle";
  connect(): Promise<void>;
  close(): Promise<void>;
  query(sql: string, params?: Record<string, QueryParam>): Promise<QueryResult>;
  describeTable(table: string): Promise<ColumnInfo[]>;
  /** Optional: MSSQL dirty-read session for ephemeral extracts. */
  beginReadUncommitted?(): Promise<void>;
  /** Optional: Oracle READ ONLY transaction for ephemeral extracts. */
  beginReadOnly?(): Promise<void>;
}
