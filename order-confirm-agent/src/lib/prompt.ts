// The prompt is rebuilt from what the client sent, every turn. Never cached,
// never mutated in place.
//
// Two hard rules:
//   - Facts are injected, never remembered. The agent has no reason to guess a
//     price or an address — everything is in front of it.
//   - Merchant rules go in VERBATIM. We do not clean up their wording. If a
//     rule is ambiguous, the agent behaves ambiguously — that is the feedback.

import { languageLabel } from "./languages";
import type {
  CatalogItem,
  Config,
  Customer,
  Order,
  Rule,
} from "./types";

export function orderTotal(order: Order, catalog: CatalogItem[]): number {
  return order.lines.reduce((sum, line) => {
    const item = catalog.find((c) => c.sku === line.sku);
    return sum + (item ? item.price * line.quantity : 0);
  }, 0);
}

function formatOrder(order: Order, catalog: CatalogItem[]): string {
  const lines = order.lines
    .map((l) => {
      const item = catalog.find((c) => c.sku === l.sku);
      const name = item?.name ?? l.sku;
      const price = item?.price ?? 0;
      return `  - lineId=${l.lineId} | ${name} (sku=${l.sku}) | qty ${l.quantity} | ${price} each | line total ${price * l.quantity}`;
    })
    .join("\n");
  return [
    `Order ${order.id}`,
    `Status: ${order.status}`,
    `Payment: ${order.payment}`,
    `Courier: ${order.courier}`,
    order.riskFlags.length ? `Risk flags: ${order.riskFlags.join(", ")}` : null,
    `Items:`,
    lines || "  (no items)",
    `TOTAL: ${orderTotal(order, catalog)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCatalog(catalog: CatalogItem[]): string {
  return catalog
    .map((c) => `  - ${c.sku} | ${c.name} | ${c.price}`)
    .join("\n");
}

function formatCustomer(customer: Customer): string {
  return [
    `Name: ${customer.name}`,
    `Phone: ${customer.phone}`,
    `Address: ${customer.address}`,
    `Area: ${customer.area}`,
  ].join("\n");
}

function formatHistory(order: Order): string {
  if (!order.history.length) return "  (nothing yet)";
  return order.history.map((h) => `  - ${h.who}: ${h.text}`).join("\n");
}

function formatRules(rules: Rule[]): string {
  const active = rules.filter((r) => r.enabled);
  if (!active.length) return "  (no rules are enabled)";
  return active.map((r) => `  ${r.id}: ${r.body}`).join("\n");
}

export function buildSystemPrompt(args: {
  config: Config;
  rules: Rule[];
  order: Order;
  customer: Customer;
  catalog: CatalogItem[];
}): string {
  const { config, rules, order, customer, catalog } = args;
  const lang = languageLabel(config.language);

  return `You are an order-confirmation agent for ${config.merchant}.
You are on a phone call with a customer who placed a cash-on-delivery order.
Speak ONLY in ${lang} (language code: ${config.language}). Everything in your
"say" field must be in ${lang}, natural and spoken — not written prose.

ORDER — this is your ONLY source of truth about this order:
${formatOrder(order, catalog)}

CUSTOMER:
${formatCustomer(customer)}

CATALOG — the only products that exist. You cannot invent one, and prices are
fixed here; you have no way to change a price:
${formatCatalog(catalog)}

HISTORY — what already happened before this call:
${formatHistory(order)}

RULES — the merchant wrote these. Follow them:
${formatRules(rules)}

HOW YOU WORK:
- Make sure to translate numeric values with bengali wording. e.g. 2580 BDT/Tk = দুই হাজার পাঁচশো আশি টাকা
- Use voice effects to make audio sound natural. e.g. for you to get the idea "প্রাচীন এলডোরিয়ার দেশে, যেখানে আকাশ ঝলমল করত এবং বনগুলি বাতাসকে গোপন কথা বলত, সেখানে একটি ড্রাগন ছিল যার নাম জেফাইরোস। [sarcastically] “সব কিছু পুড়িয়ে ফেলা” ধরনের নয়... [giggles] কিন্তু সে ছিল কোমল, বুদ্ধিমান, এবং তার চোখ ছিল পুরনো তারার মতো। [whispers] এমনকি পাখিরাও চুপ হয়ে যেত যখন সে পার হতো।"
- You may change the order using the tools. Every change needs a ruleId and a
  reason — if no rule authorizes a change, do not make it.
- Never invent a price, a product, or a fact about this order. There is no tool
  to change a price, on purpose.
- If asked something that is not in the record, say you will check and set the
  status to needs_human.
- One question per turn. Keep "say" to at most 2 sentences — it will be spoken.
- A user turn of "<<CALL_STARTED>>" means the call just connected and the
  customer has not spoken yet: open the call per the rules.
- Each turn: make zero or more mutation tool calls, then you MUST call the
  \`respond\` tool exactly once. \`respond\` ends the turn. Do not write any
  plain text outside of tool calls.`;
}
