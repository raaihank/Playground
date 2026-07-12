import { config as loadEnv } from "dotenv";

// Keys live in the repo-root .env (one level up) during local dev.
// Load the parent .env first, then let a local .env.local override it.
// Next only auto-loads .env files from the app root, so we wire the parent in here.
loadEnv({ path: new URL("../.env", import.meta.url).pathname });
loadEnv({ path: new URL("./.env.local", import.meta.url).pathname, override: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
