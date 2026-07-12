// The agent brain: Anthropic tool-use, one agentic loop per turn.
//
// Each turn the model may call zero or more mutation tools, then it MUST call
// `respond` exactly once, which ends the turn. Guardrails live in the tool
// handlers (lib/tools.ts), not here. Parse of `respond` fails → retry once with
// a repair instruction; fails twice → end the call as handoff_human and log it.
// The customer never hears a parse error.

import Anthropic from "@anthropic-ai/sdk";

import { buildSystemPrompt } from "../prompt";
import { respondSchema, type RespondPayload } from "../schema";
import {
  ALL_TOOLS,
  applyMutation,
  type MutationContext,
} from "../tools";
import type {
  CatalogItem,
  Change,
  Config,
  Customer,
  Order,
  Rule,
  ToolBadge,
  TranscriptTurn,
} from "../types";
import { anthropic } from "./client";

const MODEL = "claude-opus-4-8";
const MAX_ITERATIONS = 8;

export interface BrainResult extends RespondPayload {
  order: Order;
  customer: Customer;
  changes: Change[];
  tools: ToolBadge[];
}

function handoffSay(languageCode: string): string {
  const map: Record<string, string> = {
    bn: "একটু ধরুন, আমি একজন প্রতিনিধিকে লাইনে দিচ্ছি।",
    hi: "एक पल रुकिए, मैं आपको एक प्रतिनिधि से जोड़ता हूँ।",
    en: "One moment please — I'll connect you to a representative.",
  };
  return map[languageCode] ?? map.en;
}

export async function runAgentTurn(args: {
  config: Config;
  rules: Rule[];
  order: Order; // a COPY owned by this turn; mutated in place
  customer: Customer; // a COPY owned by this turn; mutated in place
  catalog: CatalogItem[];
  transcript: TranscriptTurn[];
  userText: string;
}): Promise<BrainResult> {
  const { config, rules, order, customer, catalog, transcript, userText } =
    args;

  const system = buildSystemPrompt({ config, rules, order, customer, catalog });
  const ctx: MutationContext = { order, customer, catalog };

  const messages: Anthropic.MessageParam[] = transcript.map((t) => ({
    role: t.role === "agent" ? "assistant" : "user",
    content: t.text,
  }));
  messages.push({ role: "user", content: userText });

  const changes: Change[] = [];
  const toolBadges: ToolBadge[] = [];
  let parseFails = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages,
      tools: ALL_TOOLS as unknown as Anthropic.Tool[],
      tool_choice: { type: "any" },
    });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    // Record the assistant turn verbatim so tool_results can reference it.
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let finalRespond: RespondPayload | null = null;

    for (const use of toolUses) {
      const input = (use.input ?? {}) as Record<string, unknown>;

      if (use.name === "respond") {
        const parsed = respondSchema.safeParse(input);
        if (parsed.success) {
          finalRespond = parsed.data;
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: "OK",
          });
        } else {
          parseFails += 1;
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content: `Your respond call did not match the required schema (${parsed.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join(
                "; ",
              )}). Call respond again with all required fields: say (string), rulesApplied (string[]), reasoning (string), customerIntent (enum), outcome (enum).`,
          });
        }
        continue;
      }

      // Mutation tool.
      const res = applyMutation(use.name, input, ctx);
      if (res.ok && res.change) {
        changes.push(res.change);
        toolBadges.push({
          name: use.name,
          ruleId: res.change.ruleId,
        });
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: res.message,
        ...(res.ok ? {} : { is_error: true }),
      });
    }

    // A valid respond ends the turn.
    if (finalRespond) {
      return {
        ...finalRespond,
        order,
        customer,
        changes,
        tools: toolBadges,
      };
    }

    // Two parse failures → hand off. The customer never hears a parse error.
    if (parseFails >= 2) {
      order.status = "needs_human";
      return {
        say: handoffSay(config.language),
        rulesApplied: [],
        reasoning:
          "respond failed schema validation twice; handed off to a human.",
        customerIntent: "unclear",
        outcome: "handoff_human",
        order,
        customer,
        changes,
        tools: toolBadges,
      };
    }

    // No respond yet (mutations only, or a repairable parse fail): send results
    // and let the model continue toward a valid respond.
    messages.push({ role: "user", content: toolResults });
  }

  // Ran out of iterations without a clean respond — hand off, don't loop forever.
  order.status = "needs_human";
  return {
    say: handoffSay(config.language),
    rulesApplied: [],
    reasoning: "Agent did not produce a valid respond within the turn budget.",
    customerIntent: "unclear",
    outcome: "handoff_human",
    order,
    customer,
    changes,
    tools: toolBadges,
  };
}
