// The shape of everything that travels between the browser (source of truth)
// and the stateless /api/turn endpoint. No vendor types leak in here.

export interface CatalogItem {
  sku: string;
  name: string;
  price: number;
}

export interface OrderLine {
  lineId: string;
  sku: string;
  quantity: number;
}

export type PaymentMethod = "cod" | "prepaid";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "needs_human"
  | "awaiting_prepayment";

export interface HistoryEntry {
  who: string;
  text: string;
}

export interface Order {
  id: string;
  lines: OrderLine[];
  payment: PaymentMethod;
  courier: string;
  status: OrderStatus;
  riskFlags: string[];
  history: HistoryEntry[];
}

export interface Customer {
  name: string;
  phone: string;
  address: string;
  area: string;
}

export interface Rule {
  id: string;
  body: string;
  enabled: boolean;
}

export interface Config {
  language: string;
  sttModel: string;
  ttsModel: string;
  voiceId: string;
  merchant: string;
}

// One reversible mutation the agent made this call.
export interface Change {
  id: string;
  ts: string; // "14:02" wall-clock label
  tool: string; // e.g. "set_quantity"
  ruleId: string;
  reason: string;
  field: string; // human label, e.g. "qty (Cotton Panjabi (XL))"
  before: string;
  after: string;
  // Snapshot to restore when this change is undone.
  undo: { order: Order; customer: Customer };
}

export type CustomerIntent =
  | "confirm"
  | "cancel"
  | "hesitant"
  | "change_order"
  | "asking_question"
  | "wrong_number"
  | "angry"
  | "unclear"
  | "none";

export type Outcome =
  | "ongoing"
  | "confirmed"
  | "cancelled"
  | "awaiting_prepayment"
  | "reschedule"
  | "handoff_human";

export interface ToolBadge {
  name: string;
  ruleId?: string;
}

export type TranscriptRole = "agent" | "you";

export interface TranscriptTurn {
  role: TranscriptRole;
  text: string;
  rulesApplied?: string[];
  tools?: ToolBadge[];
}

// Client → /api/turn
export type TurnInput =
  | { type: "start" }
  | { type: "text"; text: string }
  | { type: "audio"; audioBase64: string; mimeType: string };

export interface TurnRequest {
  config: Config;
  rules: Rule[];
  order: Order;
  customer: Customer;
  catalog: CatalogItem[];
  transcript: TranscriptTurn[];
  input: TurnInput;
}

// /api/turn → client
export interface TurnResponse {
  say: string;
  audioBase64: string | null;
  transcribedText: string | null; // what STT heard, if input was audio
  rulesApplied: string[];
  reasoning: string;
  customerIntent: CustomerIntent;
  outcome: Outcome;
  order: Order;
  customer: Customer;
  changes: Change[]; // changes made THIS turn (already applied to order/customer above)
  tools: ToolBadge[]; // tool badges for the agent turn
  latencyMs: number;
}
