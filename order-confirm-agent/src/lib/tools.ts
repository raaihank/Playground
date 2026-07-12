// The heart of it: tool definitions + handlers + GUARDRAILS.
//
// A prompt is a suggestion. Code is a rule. Anything we care about is enforced
// HERE, in the handler — never left to the model:
//   1. add_item rejects any SKU not in catalog.json.
//   2. Quantity is clamped to 1..10. Anything else is a tool error.
//   3. There is no price tool. The agent has no mechanism to change a price.
//   4. Every mutation is logged to changes[] with ruleId, reason, before, after.
//   5. Every mutation carries a before-snapshot so the UI can reverse it.
//   6. A rejected call returns a plain-English error so the model can recover.

import type { CatalogItem, Change, Customer, Order } from "./types";

// ── Tool schemas (plain JSON, cast to the vendor's Tool type in the provider) ──

export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

const ruleAndReason = {
  ruleId: {
    type: "string",
    description:
      "The ID of the rule that authorizes this change (e.g. 'R3'). If no rule authorizes it, do not make the change.",
  },
  reason: {
    type: "string",
    description: "One short phrase: why you are making this change.",
  },
};

export const MUTATION_TOOLS: ToolDef[] = [
  {
    name: "set_quantity",
    description:
      "Change the quantity of an existing order line. Use when the customer wants more or fewer of an item they already ordered.",
    input_schema: {
      type: "object",
      properties: {
        lineId: { type: "string", description: "The lineId to change." },
        quantity: {
          type: "integer",
          description: "The new quantity. Must be between 1 and 10.",
        },
        ...ruleAndReason,
      },
      required: ["lineId", "quantity", "ruleId", "reason"],
    },
  },
  {
    name: "remove_item",
    description: "Remove an order line entirely.",
    input_schema: {
      type: "object",
      properties: {
        lineId: { type: "string", description: "The lineId to remove." },
        ...ruleAndReason,
      },
      required: ["lineId", "ruleId", "reason"],
    },
  },
  {
    name: "add_item",
    description:
      "Add a product to the order. The sku MUST exist in the catalog — you cannot invent a product.",
    input_schema: {
      type: "object",
      properties: {
        sku: { type: "string", description: "A sku that exists in the catalog." },
        quantity: {
          type: "integer",
          description: "Quantity to add. Must be between 1 and 10.",
        },
        ...ruleAndReason,
      },
      required: ["sku", "quantity", "ruleId", "reason"],
    },
  },
  {
    name: "update_address",
    description: "Update the customer's delivery address.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "The corrected address." },
        ...ruleAndReason,
      },
      required: ["address", "ruleId", "reason"],
    },
  },
  {
    name: "update_customer",
    description:
      "Update a single customer field (name, phone, address, or area/city).",
    input_schema: {
      type: "object",
      properties: {
        field: {
          type: "string",
          enum: ["name", "phone", "address", "area"],
          description:
            "Which field to update. 'area' is the city/region (e.g. Dhaka, Chittagong).",
        },
        value: { type: "string", description: "The new value." },
        ...ruleAndReason,
      },
      required: ["field", "value", "ruleId", "reason"],
    },
  },
  {
    name: "set_payment",
    description: "Set the payment method to cash-on-delivery or prepaid.",
    input_schema: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["cod", "prepaid"],
          description: "The payment method.",
        },
        ...ruleAndReason,
      },
      required: ["method", "ruleId", "reason"],
    },
  },
  {
    name: "set_status",
    description:
      "Set the order's status. Use to confirm, cancel, hand off to a human, or mark awaiting prepayment.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: [
            "confirmed",
            "cancelled",
            "needs_human",
            "awaiting_prepayment",
          ],
          description: "The new status.",
        },
        ...ruleAndReason,
      },
      required: ["status", "ruleId", "reason"],
    },
  },
];

export const RESPOND_TOOL: ToolDef = {
  name: "respond",
  description:
    "End the turn. Call this exactly once, after any mutations, with what you will SAY to the customer plus the trace fields. This is the only way a turn ends.",
  input_schema: {
    type: "object",
    properties: {
      say: {
        type: "string",
        description:
          "What the agent speaks aloud. Max 2 sentences. Written to be heard, not read. In the configured language.",
      },
      rulesApplied: {
        type: "array",
        items: { type: "string" },
        description:
          "ONLY the rule IDs that drove THIS turn (e.g. ['R1','R3']). No padding.",
      },
      reasoning: {
        type: "string",
        description: "One line, in English, shown to the merchant.",
      },
      customerIntent: {
        type: "string",
        enum: [
          "confirm",
          "cancel",
          "hesitant",
          "change_order",
          "asking_question",
          "wrong_number",
          "angry",
          "unclear",
          "none",
        ],
      },
      outcome: {
        type: "string",
        enum: [
          "ongoing",
          "confirmed",
          "cancelled",
          "awaiting_prepayment",
          "reschedule",
          "handoff_human",
        ],
      },
    },
    required: [
      "say",
      "rulesApplied",
      "reasoning",
      "customerIntent",
      "outcome",
    ],
  },
};

export const ALL_TOOLS: ToolDef[] = [...MUTATION_TOOLS, RESPOND_TOOL];

// ── Handlers ──────────────────────────────────────────────────────────────

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

export interface MutationContext {
  order: Order;
  customer: Customer;
  catalog: CatalogItem[];
}

export interface MutationResult {
  ok: boolean;
  message: string; // plain-English, shown to the model as the tool_result
  change?: Change;
}

function nameForSku(catalog: CatalogItem[], sku: string): string {
  return catalog.find((c) => c.sku === sku)?.name ?? sku;
}

function isValidQty(q: unknown): q is number {
  return typeof q === "number" && Number.isInteger(q) && q >= 1 && q <= 10;
}

let addSeq = 0;

// Applies one mutation to ctx.order / ctx.customer IN PLACE (they are copies
// owned by this turn). Returns a plain-English result and, on success, a Change
// carrying a before-snapshot so the UI can reverse it.
export function applyMutation(
  name: string,
  input: Record<string, unknown>,
  ctx: MutationContext,
): MutationResult {
  const ruleId = typeof input.ruleId === "string" ? input.ruleId : "";
  const reason = typeof input.reason === "string" ? input.reason : "";
  if (!ruleId || !reason) {
    return {
      ok: false,
      message:
        "Rejected: every change needs a ruleId and a reason. If no rule authorizes this change, do not make it.",
    };
  }

  // Snapshot the state BEFORE this mutation so undo can restore it.
  const before = { order: clone(ctx.order), customer: clone(ctx.customer) };

  const makeChange = (
    field: string,
    beforeVal: string,
    afterVal: string,
  ): Change => ({
    id: `chg-${Date.now()}-${addSeq++}`,
    ts: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    tool: name,
    ruleId,
    reason,
    field,
    before: beforeVal,
    after: afterVal,
    undo: before,
  });

  switch (name) {
    case "set_quantity": {
      const lineId = String(input.lineId ?? "");
      const line = ctx.order.lines.find((l) => l.lineId === lineId);
      if (!line) {
        return {
          ok: false,
          message: `Rejected: no order line with lineId "${lineId}". Current lines: ${ctx.order.lines
            .map((l) => l.lineId)
            .join(", ")}.`,
        };
      }
      if (!isValidQty(input.quantity)) {
        return {
          ok: false,
          message: `Rejected: quantity must be a whole number between 1 and 10 (got ${JSON.stringify(
            input.quantity,
          )}). To remove the item, use remove_item.`,
        };
      }
      const productName = nameForSku(ctx.catalog, line.sku);
      const beforeQty = line.quantity;
      line.quantity = input.quantity;
      return {
        ok: true,
        message: `OK: ${productName} quantity is now ${input.quantity} (was ${beforeQty}).`,
        change: makeChange(
          `qty · ${productName}`,
          String(beforeQty),
          String(input.quantity),
        ),
      };
    }

    case "remove_item": {
      const lineId = String(input.lineId ?? "");
      const idx = ctx.order.lines.findIndex((l) => l.lineId === lineId);
      if (idx === -1) {
        return {
          ok: false,
          message: `Rejected: no order line with lineId "${lineId}".`,
        };
      }
      const line = ctx.order.lines[idx];
      const productName = nameForSku(ctx.catalog, line.sku);
      ctx.order.lines.splice(idx, 1);
      return {
        ok: true,
        message: `OK: removed ${productName}.`,
        change: makeChange(
          `remove · ${productName}`,
          `${productName} ×${line.quantity}`,
          "removed",
        ),
      };
    }

    case "add_item": {
      const sku = String(input.sku ?? "");
      const item = ctx.catalog.find((c) => c.sku === sku);
      if (!item) {
        return {
          ok: false,
          message: `Rejected: "${sku}" is not a product we stock. You cannot invent a product. Valid skus: ${ctx.catalog
            .map((c) => c.sku)
            .join(", ")}.`,
        };
      }
      if (!isValidQty(input.quantity)) {
        return {
          ok: false,
          message: `Rejected: quantity must be a whole number between 1 and 10 (got ${JSON.stringify(
            input.quantity,
          )}).`,
        };
      }
      const lineId = `L-${Date.now().toString(36)}-${addSeq}`;
      ctx.order.lines.push({ lineId, sku, quantity: input.quantity });
      return {
        ok: true,
        message: `OK: added ${item.name} ×${input.quantity}.`,
        change: makeChange(
          `add · ${item.name}`,
          "—",
          `${item.name} ×${input.quantity}`,
        ),
      };
    }

    case "update_address": {
      const address = String(input.address ?? "").trim();
      if (!address) {
        return { ok: false, message: "Rejected: address cannot be empty." };
      }
      const beforeVal = ctx.customer.address;
      ctx.customer.address = address;
      return {
        ok: true,
        message: `OK: address updated to "${address}".`,
        change: makeChange("address", beforeVal, address),
      };
    }

    case "update_customer": {
      const field = String(input.field ?? "");
      const value = String(input.value ?? "").trim();
      if (
        field !== "name" &&
        field !== "phone" &&
        field !== "address" &&
        field !== "area"
      ) {
        return {
          ok: false,
          message: `Rejected: field must be name, phone, address, or area (got "${field}").`,
        };
      }
      if (!value) {
        return { ok: false, message: `Rejected: ${field} cannot be empty.` };
      }
      const beforeVal = ctx.customer[field];
      ctx.customer[field] = value;
      return {
        ok: true,
        message: `OK: ${field} updated to "${value}".`,
        change: makeChange(field, beforeVal, value),
      };
    }

    case "set_payment": {
      const method = String(input.method ?? "");
      if (method !== "cod" && method !== "prepaid") {
        return {
          ok: false,
          message: `Rejected: method must be cod or prepaid (got "${method}").`,
        };
      }
      const beforeVal = ctx.order.payment;
      ctx.order.payment = method;
      return {
        ok: true,
        message: `OK: payment set to ${method}.`,
        change: makeChange("payment", beforeVal, method),
      };
    }

    case "set_status": {
      const status = String(input.status ?? "");
      const valid = [
        "confirmed",
        "cancelled",
        "needs_human",
        "awaiting_prepayment",
      ];
      if (!valid.includes(status)) {
        return {
          ok: false,
          message: `Rejected: status must be one of ${valid.join(", ")}.`,
        };
      }
      const beforeVal = ctx.order.status;
      ctx.order.status = status as Order["status"];
      return {
        ok: true,
        message: `OK: status set to ${status}.`,
        change: makeChange("status", beforeVal, status),
      };
    }

    default:
      return {
        ok: false,
        message: `Rejected: unknown tool "${name}".`,
      };
  }
}
