"use client";

import type { CatalogItem, Order } from "@/lib/types";

// Line items, quantities, total, payment, courier, status pill. When the agent
// changes something, the field flashes (see the .flash CSS). This is the demo:
// if the merchant can't SEE the order changing under the agent's hands, none of
// this lands.

function money(n: number): string {
  return `৳${n.toLocaleString("en-US")}`;
}

export default function OrderPanel({
  order,
  catalog,
  flash,
}: {
  order: Order;
  catalog: CatalogItem[];
  flash: Set<string>;
}) {
  const nameFor = (sku: string) =>
    catalog.find((c) => c.sku === sku)?.name ?? sku;
  const priceFor = (sku: string) =>
    catalog.find((c) => c.sku === sku)?.price ?? 0;
  const total = order.lines.reduce(
    (s, l) => s + priceFor(l.sku) * l.quantity,
    0,
  );
  const fl = (key: string) => (flash.has(key) ? " flash" : "");

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Order · live</span>
        <span className="mono muted">{order.id}</span>
      </div>

      <div style={{ padding: "8px 0" }}>
        <div className="kv" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="k">Items</span>
          <span className={`v pill pill-${order.status}${fl("status")}`}>
            <span className="glyph">⬤</span>
            {order.status}
          </span>
        </div>

        {order.lines.length === 0 && (
          <div className="empty">no items</div>
        )}
        {order.lines.map((l) => (
          <div className={`line-item${fl(`line:${l.lineId}`)}`} key={l.lineId}>
            <span>{nameFor(l.sku)}</span>
            <span className="li-qty">×{l.quantity}</span>
            <span className="li-price">
              {money(priceFor(l.sku) * l.quantity)}
            </span>
          </div>
        ))}

        <div className={`total-row${fl("total")}`}>
          <span>Total</span>
          <span className="v">{money(total)}</span>
        </div>

        <div className={`kv${fl("payment")}`}>
          <span className="k">Payment</span>
          <span className="v" style={{ textTransform: "uppercase" }}>
            {order.payment}
          </span>
        </div>
        <div className={`kv${fl("courier")}`}>
          <span className="k">Courier</span>
          <span className="v">{order.courier}</span>
        </div>
        {order.riskFlags.length > 0 && (
          <div className="kv">
            <span className="k">Risk</span>
            <span className="v" style={{ color: "var(--amber)" }}>
              {order.riskFlags.join(", ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
