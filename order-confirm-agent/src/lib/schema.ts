import { z } from "zod";

// The `respond` tool's input. This is the ONLY way a turn ends.
// Parse fails → retry once with a repair instruction. Fails twice → the caller
// ends the call as handoff_human. The customer never hears a parse error.
export const respondSchema = z.object({
  // What the agent SPEAKS. Max 2 sentences. Written to be heard, not read.
  say: z.string().min(1),
  // ONLY the rules that drove THIS turn. No padding.
  rulesApplied: z.array(z.string()),
  // One line, shown to the merchant in the trace.
  reasoning: z.string(),
  customerIntent: z.enum([
    "confirm",
    "cancel",
    "hesitant",
    "change_order",
    "asking_question",
    "wrong_number",
    "angry",
    "unclear",
    "none",
  ]),
  outcome: z.enum([
    "ongoing",
    "confirmed",
    "cancelled",
    "awaiting_prepayment",
    "reschedule",
    "handoff_human",
  ]),
});

export type RespondPayload = z.infer<typeof respondSchema>;
