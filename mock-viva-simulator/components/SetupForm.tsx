"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExamMode } from "@/lib/types";

// Fields shown per mode. BCS needs the full candidate profile; IELTS Speaking is
// a general English test, so it only needs a name plus optional context.
type Field = {
  name: "candidateName" | "cadre" | "academicBackground" | "hometown";
  label: string;
  placeholder: string;
  required: boolean;
};

const BCS_FIELDS: Field[] = [
  { name: "candidateName", label: "Name", placeholder: "Your full name", required: true },
  { name: "cadre", label: "Preferred cadre", placeholder: "e.g. Foreign Affairs, Police, Admin", required: true },
  {
    name: "academicBackground",
    label: "Academic background",
    placeholder: "e.g. BSc in Economics, University of Dhaka",
    required: true,
  },
  { name: "hometown", label: "Hometown / district", placeholder: "e.g. Rajshahi", required: true },
];

const IELTS_FIELDS: Field[] = [
  { name: "candidateName", label: "Name", placeholder: "Your full name", required: true },
  {
    name: "academicBackground",
    label: "Work or studies",
    placeholder: "e.g. Student of Computer Science (optional)",
    required: false,
  },
];

const MODES: { value: ExamMode; label: string; blurb: string }[] = [
  { value: "bcs", label: "BCS Viva", blurb: "3-member oral board · Bengali & English" },
  { value: "ielts", label: "IELTS Speaking", blurb: "1 examiner · Part 1/2/3 · band score" },
];

type FormState = {
  candidateName: string;
  cadre: string;
  academicBackground: string;
  hometown: string;
  notes: string;
};

const EMPTY: FormState = {
  candidateName: "",
  cadre: "",
  academicBackground: "",
  hometown: "",
  notes: "",
};

export default function SetupForm() {
  const router = useRouter();
  const [mode, setMode] = useState<ExamMode>("bcs");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = mode === "ielts" ? IELTS_FIELDS : BCS_FIELDS;

  function update(name: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, ...form }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/session/${data.session.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not start the session.");
      setSubmitting(false);
    }
  }

  const required = fields.every(
    (f) => !f.required || form[f.name].trim().length > 0,
  );

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      {/* Mode toggler */}
      <div
        role="radiogroup"
        aria-label="Exam type"
        className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60"
      >
        {MODES.map((m) => {
          const active = mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(m.value)}
              className={`rounded-lg px-3 py-2 text-left transition ${
                active
                  ? "bg-white shadow-sm dark:bg-slate-900"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <span className="block text-sm font-medium">{m.label}</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                {m.blurb}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.name} className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {f.label}
              {!f.required && (
                <span className="text-slate-400 dark:text-slate-500"> (optional)</span>
              )}
            </span>
            <input
              value={form[f.name]}
              onChange={(e) => update(f.name, e.target.value)}
              placeholder={f.placeholder}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
            />
          </label>
        ))}
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Additional notes <span className="text-slate-400 dark:text-slate-500">(optional)</span>
        </span>
        <textarea
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder={
            mode === "ielts"
              ? "Anything to help personalise Part 1 — hobbies, interests, etc."
              : "Anything you want the panel to know — hobbies, work experience, etc."
          }
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
        />
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !required}
        className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        {submitting
          ? mode === "ielts"
            ? "Preparing your test…"
            : "Building your panel…"
          : mode === "ielts"
            ? "Begin IELTS test"
            : "Begin viva"}
      </button>
      {submitting && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {mode === "ielts"
            ? "Preparing a Part 1/2/3 speaking test. This takes a few seconds."
            : "Generating a 3-member panel and ~10 questions. This takes a few seconds."}
        </p>
      )}
    </form>
  );
}
