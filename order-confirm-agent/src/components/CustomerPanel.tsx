"use client";

import { useState } from "react";

import type { Customer } from "@/lib/types";

// Customer data is editable by the operator, mid-call. Change the address, and
// the agent sees the new value on its NEXT turn. This is how you test
// "customer corrects their address."

export default function CustomerPanel({
  customer,
  flash,
  onEdit,
}: {
  customer: Customer;
  flash: Set<string>;
  onEdit: (next: Customer) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Customer>(customer);
  const fl = (key: string) => (flash.has(key) ? " flash" : "");

  const openEdit = () => {
    setDraft(customer);
    setEditing(true);
  };
  const save = () => {
    onEdit(draft);
    setEditing(false);
  };

  const fields: { key: keyof Customer; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "phone", label: "Phone" },
    { key: "address", label: "Address" },
    { key: "area", label: "Area" },
  ];

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Customer</span>
        {editing ? (
          <span>
            <button
              className="btn btn-ghost"
              style={{ padding: "3px 10px", fontSize: 12, marginRight: 6 }}
              onClick={() => setEditing(false)}
            >
              cancel
            </button>
            <button
              className="btn btn-primary"
              style={{ padding: "3px 10px", fontSize: 12 }}
              onClick={save}
            >
              save
            </button>
          </span>
        ) : (
          <button
            className="btn btn-ghost"
            style={{ padding: "3px 10px", fontSize: 12 }}
            onClick={openEdit}
          >
            edit
          </button>
        )}
      </div>

      <div>
        {fields.map((f) => (
          <div className={`cust-field${fl(`cust:${f.key}`)}`} key={f.key}>
            <div className="cf-label">{f.label}</div>
            {editing ? (
              <input
                value={draft[f.key]}
                onChange={(e) =>
                  setDraft({ ...draft, [f.key]: e.target.value })
                }
              />
            ) : (
              <div className="cf-value">{customer[f.key]}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
