// DB client singleton (spec §6). Reused across hot reloads in dev so we don't
// open a new postgres connection pool on every request.
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. See .env.example.");
}

const globalForDb = globalThis as unknown as {
  _bcsPg?: ReturnType<typeof postgres>;
};

const client = globalForDb._bcsPg ?? postgres(connectionString, { max: 5 });
if (process.env.NODE_ENV !== "production") globalForDb._bcsPg = client;

export const db = drizzle(client, { schema });
