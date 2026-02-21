"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Job = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  description: string | null;
  created_at: string;

  candidate_count: number;
  avg_score: number | null;
  top_score: number | null;
};

export default function DashboardPage() {
  const supabase = createSupabaseBrowserClient();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeTab, setActiveTab] = useState<"jobs" | "profile">("jobs");

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // modal form
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  const canCreate =
    title.trim().length > 0 && description.trim().length > 0 && !creating;

  async function loadJobs() {
    const res = await fetch("/api/jobs");
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "Failed to load jobs");
    setJobs(json.data ?? []);
  }

  useEffect(() => {
    loadJobs().catch((e) => setErr(e.message));
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function createJob() {
    setErr(null);
    if (!title.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          company: company.trim() || null,
          location: location.trim() || null,
          description: description.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to create job");

      // reset + refresh
      setTitle("");
      setCompany("");
      setLocation("");
      setDescription("");
      setOpen(false);

      await loadJobs();
    } catch (e: any) {
      setErr(e.message ?? "Error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <NavBar
        active={activeTab}
        onJobs={() => setActiveTab("jobs")}
        onProfile={() => setActiveTab("profile")}
        onLogout={logout}
        onCreateJob={() => setOpen(true)}
      />

      <div className="mx-auto max-w-6xl px-6 py-10">
        {activeTab === "jobs" ? (
          <>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Jobs</h1>
                <p className="mt-1 text-sm text-zinc-400">
                  Search candidates and manage candidates per job.
                </p>
              </div>

              <button
                onClick={() => setOpen(true)}
                className="hidden rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white md:inline-flex"
              >
                + Search Candidate
              </button>
            </div>

            {err && (
              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm">
                {err}
              </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {jobs.map((j) => (
                <a
                  key={j.id}
                  href={`/jobs/${j.id}`}
                  className="group rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5 hover:bg-zinc-900/45"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold group-hover:text-white">
                        {j.title}
                      </div>
                      <div className="mt-1 text-sm text-zinc-400">
                        {j.company ?? "-"} - {j.location ?? "-"}
                      </div>
                    </div>
                    <div className="rounded-full border border-zinc-800 bg-zinc-950/40 px-3 py-1 text-xs text-zinc-300">
                      {j.candidate_count} candidates
                    </div>
                  </div>

                  {j.description && (
                    <div className="mt-3 line-clamp-2 text-sm text-zinc-400">
                      {j.description}
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <Stat
                      label="Candidates"
                      value={String(j.candidate_count)}
                    />
                    <Stat
                      label="Avg score"
                      value={j.avg_score == null ? "-" : j.avg_score.toFixed(1)}
                    />
                    <Stat
                      label="Top score"
                      value={j.top_score == null ? "-" : String(j.top_score)}
                    />
                  </div>

                  <div className="mt-4 text-xs text-zinc-500">
                    Created: {new Date(j.created_at).toLocaleString()}
                  </div>
                </a>
              ))}

              {jobs.length === 0 && (
                <div className="rounded-2xl border border-zinc-800 border-dashed bg-transparent p-8 text-zinc-400">
                  No jobs yet. Click{" "}
                  <span className="text-zinc-200">Search Candidate</span> to get
                  started.
                </div>
              )}
            </div>
          </>
        ) : (
          <ProfileCard />
        )}
      </div>

      <CreateJobModal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        setTitle={setTitle}
        company={company}
        setCompany={setCompany}
        location={location}
        setLocation={setLocation}
        description={description}
        setDescription={setDescription}
        creating={creating}
        canCreate={canCreate}
        onCreate={createJob}
      />
    </div>
  );
}

function NavBar(props: {
  active: "jobs" | "profile";
  onJobs: () => void;
  onProfile: () => void;
  onLogout: () => void;
  onCreateJob: () => void;
}) {
  return (
    <div className="sticky top-0 z-50 border-b border-zinc-900 bg-zinc-950/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-1 text-sm font-semibold">
            ATS
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <NavItem
              active={props.active === "jobs"}
              onClick={props.onJobs}
              label="Jobs"
            />
            <NavItem
              active={props.active === "profile"}
              onClick={props.onProfile}
              label="Profile"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={props.onCreateJob}
            className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white"
          >
            + Search Candidate
          </button>

          <button
            onClick={props.onLogout}
            className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-900/60"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="mx-auto flex max-w-6xl gap-2 px-6 pb-3 md:hidden">
        <NavItem
          active={props.active === "jobs"}
          onClick={props.onJobs}
          label="Jobs"
        />
        <NavItem
          active={props.active === "profile"}
          onClick={props.onProfile}
          label="Profile"
        />
      </div>
    </div>
  );
}

function NavItem({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-xl px-3 py-2 text-sm font-semibold transition",
        active
          ? "bg-zinc-100 text-zinc-950"
          : "bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function CreateJobModal(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  setTitle: (v: string) => void;
  company: string;
  setCompany: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  creating: boolean;
  canCreate: boolean;
  onCreate: () => void;
}) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70" onClick={props.onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Search Candidate</div>
            <div className="mt-1 text-sm text-zinc-400">
              Add details to organize candidates.
            </div>
          </div>
          <button
            onClick={props.onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm hover:bg-zinc-900/70"
          >
            X
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <input
            value={props.title}
            onChange={(e) => props.setTitle(e.target.value)}
            placeholder="Job title (required)"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm outline-none focus:border-zinc-600"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={props.company}
              onChange={(e) => props.setCompany(e.target.value)}
              placeholder="Company (optional)"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm outline-none focus:border-zinc-600"
            />
            <input
              value={props.location}
              onChange={(e) => props.setLocation(e.target.value)}
              placeholder="Location (optional)"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm outline-none focus:border-zinc-600"
            />
          </div>
          <textarea
            value={props.description}
            onChange={(e) => props.setDescription(e.target.value)}
            rows={5}
            placeholder="Job description (required)"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm outline-none focus:border-zinc-600"
          />
        </div>

        <button
          onClick={props.onCreate}
          disabled={!props.canCreate}
          className="mt-5 w-full rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-white disabled:opacity-60"
        >
          {props.creating ? "Creating..." : "Search candidate"}
        </button>
      </div>
    </div>
  );
}

function ProfileCard() {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6">
      <div className="text-lg font-semibold">Profile</div>
      <div className="mt-2 text-sm text-zinc-400">
        For now, this can be a placeholder. Later we'll show your email, plan,
        and settings.
      </div>
    </div>
  );
}
