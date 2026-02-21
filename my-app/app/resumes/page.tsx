"use client";

import React, { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type ResumeRow = {
  id: string;
  original_filename: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  score: number | null;
  status: string;
  created_at: string;
};

export default function ResumesPage() {
  const supabase = createSupabaseBrowserClient();

  const [rows, setRows] = useState<ResumeRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/resumes");
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "Failed to load");
    setRows(json.data ?? []);
  }

  useEffect(() => {
    refresh().catch(e => setErr(e.message));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!file) return;

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (jobDescription.trim()) fd.append("jobDescription", jobDescription.trim());

      const res = await fetch("/api/resumes/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Upload failed");

      setFile(null);
      await refresh();
    } catch (e: any) {
      setErr(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>My Resumes</h1>
        <button onClick={signOut} style={{ padding: "10px 14px", fontWeight: 700 }}>Sign out</button>
      </div>

      <form onSubmit={upload} style={{ marginTop: 12, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ fontWeight: 700 }}>Upload resume / ZIP</label>
          <input
            type="file"
            accept=".pdf,.docx,.txt,.zip,application/pdf,application/zip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <label style={{ fontWeight: 700, marginTop: 8 }}>Job Description (optional)</label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={4}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />

          <button
            type="submit"
            disabled={!file || loading}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #000", background: "#fff", fontWeight: 800 }}
          >
            {loading ? "Processing..." : "Upload"}
          </button>

          {err && <div style={{ color: "crimson" }}>{err}</div>}
        </div>
      </form>

      <h2 style={{ marginTop: 20, fontSize: 18, fontWeight: 800 }}>Parsed</h2>

      <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
        {rows.map(r => (
          <div key={r.id} style={{ padding: 14, border: "1px solid #ddd", borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800 }}>{r.full_name ?? "Unknown Name"}</div>
              <div style={{ opacity: 0.75, fontSize: 13 }}>{new Date(r.created_at).toLocaleString()}</div>
            </div>

            <div style={{ marginTop: 6, opacity: 0.85 }}>{r.original_filename}</div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              <Field label="Email" value={r.email} />
              <Field label="Phone" value={r.phone} />
              <Field label="Status" value={r.status} />
              <Field label="Score" value={r.score != null ? String(r.score) : null} />
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div style={{ padding: 14, border: "1px dashed #ccc", borderRadius: 12, opacity: 0.8 }}>
            No resumes yet.
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value ?? "-"}</div>
    </div>
  );
}
