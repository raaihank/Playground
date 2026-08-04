import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js keeps env in .env.local; load it here so drizzle-kit sees DATABASE_URL.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
