// GET  → the full seed the browser bootstraps from (config, rules, catalog,
//        order, customer). The browser owns state after this.
// PUT  → persists config.json + rules.json (written by /setup).

import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import type {
  CatalogItem,
  Config,
  Customer,
  Order,
  Rule,
} from "@/lib/types";

export const runtime = "nodejs";

const DATA_DIR = path.join(process.cwd(), "data");

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
  return JSON.parse(raw) as T;
}

export async function GET() {
  try {
    const [config, rules, catalog, order, customer] = await Promise.all([
      readJson<Config>("config.json"),
      readJson<Rule[]>("rules.json"),
      readJson<CatalogItem[]>("catalog.json"),
      readJson<Order>("order.json"),
      readJson<Customer>("customer.json"),
    ]);
    return NextResponse.json({ config, rules, catalog, order, customer });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { config?: Config; rules?: Rule[] };
    if (body.config) {
      await fs.writeFile(
        path.join(DATA_DIR, "config.json"),
        JSON.stringify(body.config, null, 2) + "\n",
        "utf8",
      );
    }
    if (body.rules) {
      await fs.writeFile(
        path.join(DATA_DIR, "rules.json"),
        JSON.stringify(body.rules, null, 2) + "\n",
        "utf8",
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
