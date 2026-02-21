"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

type ResumeRow = {
  id: string;
  original_filename: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  score: number | null;
  status: string;
  created_at: string;
  parsed_json: any;
};

type Job = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  description: string;
  created_at: string;
};

export default function JobClient({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<ResumeRow[]>([]);
  const [job, setJob] = useState<Job | null>(null);

  const [loadingList, setLoadingList] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // filters
  const [locationFilter, setLocationFilter] = useState("");
  const [minExpFilter, setMinExpFilter] = useState("");
  const [visaFilter, setVisaFilter] = useState("");
  const [workAuthFilter, setWorkAuthFilter] = useState("");

  // edit modal
  const [editCandidate, setEditCandidate] = useState<ResumeRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // delete modal
  const [deleteCandidate, setDeleteCandidate] = useState<ResumeRow | null>(
    null,
  );
  const [deleteOpen, setDeleteOpen] = useState(false);

  // delete job modal
  const [deleteJobOpen, setDeleteJobOpen] = useState(false);

  // expanded row
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  type SortField = "score" | "status" | null;
  type SortDirection = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const total = rows.length;
  const avgScore = useMemo(() => {
    const scores = rows
      .map((r) => r.score)
      .filter((s): s is number => typeof s === "number");
    if (scores.length === 0) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }, [rows]);

  const sortedRows = useMemo(() => {
    if (!sortField) return rows;
    return [...rows].sort((a, b) => {
      const aVal = sortField === "score" ? (a.score ?? 0) : a.status;
      const bVal = sortField === "score" ? (b.score ?? 0) : b.status;

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortField, sortDirection]);

  async function loadJob() {
    const res = await fetch(`/api/jobs/${jobId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "Failed to load job");
    setJob(json.data);
  }

  async function refreshResumes() {
    const params = new URLSearchParams();
    if (locationFilter.trim())
      params.set("candidate_location", locationFilter.trim());
    if (minExpFilter.trim())
      params.set("years_experience", minExpFilter.trim());
    if (visaFilter.trim()) params.set("visa_status", visaFilter.trim());
    if (workAuthFilter.trim())
      params.set("work_authorization", workAuthFilter.trim());

    const res = await fetch(`/api/jobs/${jobId}/resumes?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "Failed to load candidates");
    setRows(json.data ?? []);
  }

  async function refreshAll() {
    setLoadingList(true);
    setErr(null);
    try {
      await Promise.all([loadJob(), refreshResumes()]);
    } catch (e: any) {
      setErr(e.message ?? "Error");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (!jobId) return;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Polling mechanism: if any resume is "uploaded", refresh every 5s
  useEffect(() => {
    const isProcessing = rows.some((r) => r.status === "uploaded");
    if (!isProcessing) return;

    const intervalId = setInterval(() => {
      refreshResumes();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [rows]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!file) return;

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("jobId", jobId);

      const res = await fetch("/api/resumes/upload", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Upload failed");

      setFile(null);
      await refreshResumes();
      setUploadOpen(false);
    } catch (e: any) {
      setErr(e.message ?? "Upload error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between">
          <a
            href="/dashboard"
            className="text-sm text-zinc-300 hover:text-white"
          >
            Back to dashboard
          </a>
          <div className="text-xs text-zinc-500">Job ID: {jobId}</div>
        </div>

        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{job?.title ?? "Job"}</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {job?.company ?? "-"} - {job?.location ?? "-"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-2 text-sm">
              <span className="text-zinc-400">Candidates:</span>{" "}
              <span className="font-semibold">{total}</span>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-2 text-sm">
              <span className="text-zinc-400">Avg score:</span>{" "}
              <span className="font-semibold">
                {avgScore == null ? "-" : avgScore.toFixed(1)}
              </span>
            </div>

            <button
              onClick={() => setDetailsOpen(true)}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-2 text-sm font-semibold hover:bg-zinc-900/60"
            >
              View job details
            </button>

            <button
              onClick={() => setUploadOpen(true)}
              className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white"
            >
              Upload resumes
            </button>

            <button
              onClick={() => setDeleteJobOpen(true)}
              className="rounded-xl bg-red-900/40 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-900/60"
            >
              Delete Job
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm">
            {err}
          </div>
        )}

        {/* Filters */}
        <div className="mt-6 flex flex-wrap gap-3 rounded-xl border border-zinc-800 bg-zinc-900/20 p-4">
          <input
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            placeholder="Filter location..."
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />
          <input
            value={minExpFilter}
            onChange={(e) => setMinExpFilter(e.target.value)}
            type="number"
            placeholder="Min Exp (years)"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />
          <select
            value={visaFilter}
            onChange={(e) => setVisaFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          >
            <option value="">Any Visa Status</option>
            <option value="citizen">Citizen</option>
            <option value="green_card">Green Card</option>
            <option value="h1b">H1B</option>
          </select>
          <select
            value={workAuthFilter}
            onChange={(e) => setWorkAuthFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          >
            <option value="">Any Work Auth</option>
            <option value="authorized">Authorized</option>
            <option value="sponsorship">Sponsorship</option>
          </select>
          <button
            onClick={refreshResumes}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white"
          >
            Apply Filters
          </button>
          {(locationFilter || minExpFilter || visaFilter || workAuthFilter) && (
            <button
              onClick={() => {
                setLocationFilter("");
                setMinExpFilter("");
                setVisaFilter("");
                setWorkAuthFilter("");
                // need to trigger refresh after state update.
                // hack: just clear params and call refresh manually or wait for effect?
                // actually easier to just clear and let user click Apply or auto-refresh
                // For now, simple clear. User hits Apply again or we add useEffect on filters?
                // Let's just clear and user clicks Apply to see all.
              }}
              className="text-sm text-zinc-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Candidates table */}
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/20">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <div className="text-sm font-semibold text-zinc-200">
              Candidates
            </div>
            <button
              onClick={refreshAll}
              disabled={loadingList}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-900/60 disabled:opacity-60"
            >
              {loadingList ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="p-8">
              <div className="rounded-2xl border border-zinc-800 border-dashed p-8 text-center">
                <div className="text-lg font-semibold">No resumes uploaded</div>
                <div className="mt-2 text-sm text-zinc-400">
                  Upload a PDF/DOCX/TXT or ZIP containing multiple resumes.
                </div>
                <button
                  onClick={() => setUploadOpen(true)}
                  className="mt-5 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white"
                >
                  Upload resumes
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-zinc-950/40 text-xs text-zinc-400">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Candidate</th>
                    <th className="px-5 py-3 font-semibold">Details</th>
                    <th
                      className="px-5 py-3 font-semibold cursor-pointer hover:text-zinc-300 select-none group"
                      onClick={() => {
                        if (sortField === "score") {
                          if (sortDirection === "asc") setSortDirection("desc");
                          else setSortField(null);
                        } else {
                          setSortField("score");
                          setSortDirection("desc");
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        Score
                        <span
                          className={`text-zinc-600 ${sortField === "score" ? "text-blue-400" : "group-hover:text-zinc-400"}`}
                        >
                          {sortField === "score"
                            ? sortDirection === "asc"
                              ? "↑"
                              : "↓"
                            : "⇅"}
                        </span>
                      </div>
                    </th>
                    <th
                      className="px-5 py-3 font-semibold cursor-pointer hover:text-zinc-300 select-none group"
                      onClick={() => {
                        if (sortField === "status") {
                          if (sortDirection === "asc") setSortDirection("desc");
                          else setSortField(null);
                        } else {
                          setSortField("status");
                          setSortDirection("desc");
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        Status
                        <span
                          className={`text-zinc-600 ${sortField === "status" ? "text-blue-400" : "group-hover:text-zinc-400"}`}
                        >
                          {sortField === "status"
                            ? sortDirection === "asc"
                              ? "↑"
                              : "↓"
                            : "⇅"}
                        </span>
                      </div>
                    </th>
                    <th className="px-5 py-3 font-semibold">Uploaded</th>
                    <th className="px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => (
                    <Fragment key={r.id}>
                      <tr
                        key={r.id}
                        className="border-t border-zinc-800 hover:bg-zinc-900/30 transition-colors"
                      >
                        <td className="px-5 py-4">
                          <div className="font-semibold">
                            {r.full_name ?? "Unknown name"}
                          </div>
                          <div className="text-xs text-zinc-400">
                            {r.original_filename}
                          </div>
                          <button
                            onClick={() =>
                              setExpandedRow(expandedRow === r.id ? null : r.id)
                            }
                            disabled={r.status === "uploaded"}
                            className="mt-2 text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {expandedRow === r.id
                              ? "Hide details"
                              : "Show details"}
                            <svg
                              className={`w-3 h-3 transform transition-transform ${
                                expandedRow === r.id ? "rotate-180" : ""
                              }`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </button>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-zinc-200">{r.email ?? "-"}</div>
                          <div className="text-zinc-400">{r.phone ?? "-"}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs">
                            {r.parsed_json?.candidate_location ? (
                              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
                                {r.parsed_json.candidate_location}
                              </span>
                            ) : (
                              <span className="rounded bg-red-900/20 px-1.5 py-0.5 text-red-300/70 border border-red-900/30">
                                Location missing
                              </span>
                            )}

                            {r.parsed_json?.years_experience != null &&
                              r.parsed_json.years_experience > 0 && (
                                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
                                  {r.parsed_json.years_experience}y exp
                                </span>
                              )}

                            {r.parsed_json?.visa_status ? (
                              <span className="rounded bg-blue-900/40 px-1.5 py-0.5 text-blue-200">
                                {r.parsed_json.visa_status.replace("_", " ")}
                              </span>
                            ) : (
                              <span className="rounded bg-red-900/20 px-1.5 py-0.5 text-red-300/70 border border-red-900/30">
                                Visa status missing
                              </span>
                            )}

                            {r.parsed_json?.work_authorization ? (
                              <span className="rounded bg-indigo-900/40 px-1.5 py-0.5 text-indigo-200">
                                {r.parsed_json.work_authorization}
                              </span>
                            ) : (
                              <span className="rounded bg-red-900/20 px-1.5 py-0.5 text-red-300/70 border border-red-900/30">
                                Auth missing
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <ScorePill score={r.score} />
                        </td>
                        <td className="px-5 py-4">
                          {r.status === "uploaded" ? (
                            <span className="inline-flex items-center gap-1 rounded bg-blue-900/30 px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-blue-400">
                              <svg
                                className="h-3 w-3 animate-spin"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                  fill="none"
                                ></circle>
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                              </svg>
                              Processing
                            </span>
                          ) : (
                            <span
                              className={`rounded-full border px-3 py-1 text-xs ${
                                r.status === "scored"
                                  ? "border-emerald-900/50 bg-emerald-950/40 text-emerald-400"
                                  : r.status === "failed"
                                    ? "border-red-900/50 bg-red-950/40 text-red-400"
                                    : "border-zinc-800 bg-zinc-950/40 text-zinc-300"
                              }`}
                            >
                              {r.status}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-zinc-400">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditCandidate(r);
                                setEditOpen(true);
                              }}
                              disabled={r.status === "uploaded"}
                              className="rounded bg-zinc-800 px-2 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Edit
                            </button>
                            <a
                              href={`/api/resumes/${r.id}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`rounded px-2 py-1 text-xs font-semibold ${
                                r.status === "uploaded"
                                  ? "bg-zinc-800/50 text-zinc-500 cursor-not-allowed"
                                  : "bg-blue-900/40 text-blue-200 hover:bg-blue-900/60"
                              }`}
                              onClick={(e) => {
                                if (r.status === "uploaded") e.preventDefault();
                              }}
                            >
                              View
                            </a>
                            <button
                              onClick={() => {
                                setDeleteCandidate(r);
                                setDeleteOpen(true);
                              }}
                              disabled={r.status === "uploaded"}
                              className="rounded bg-red-900/40 px-2 py-1 text-xs font-semibold text-red-300 hover:bg-red-900/60 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedRow === r.id && (
                        <tr key={`${r.id}-det`} className="bg-zinc-900/10">
                          <td colSpan={6} className="px-5 py-0">
                            <div className="border-l border-zinc-800 pl-6 py-6 space-y-6">
                              {/* Gemini Scoring Breakdown */}
                              {r.parsed_json?.scoring?.breakdown && (
                                <div className="mb-6 bg-blue-900/10 rounded-lg p-5 border border-blue-900/20">
                                  <h4 className="text-sm font-semibold text-blue-400 flex items-center gap-2 mb-3">
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M13 10V3L4 14h7v7l9-11h-7z"
                                      />
                                    </svg>
                                    AI Scoring Analysis - {r.score}/100
                                  </h4>

                                  {r.parsed_json.scoring.breakdown
                                    .relevance && (
                                    <p className="text-sm text-zinc-300 mb-4 leading-relaxed">
                                      {
                                        r.parsed_json.scoring.breakdown
                                          .relevance
                                      }
                                    </p>
                                  )}

                                  <div className="grid md:grid-cols-2 gap-4 text-sm mt-4">
                                    {r.parsed_json.scoring.breakdown.strengths
                                      ?.length > 0 && (
                                      <div>
                                        <h5 className="font-medium text-emerald-400 mb-2">
                                          Strengths
                                        </h5>
                                        <ul className="list-disc list-inside space-y-1 text-zinc-400 text-xs">
                                          {r.parsed_json.scoring.breakdown.strengths.map(
                                            (s: string, i: number) => (
                                              <li key={i}>{s}</li>
                                            ),
                                          )}
                                        </ul>
                                      </div>
                                    )}

                                    {r.parsed_json.scoring.breakdown.weaknesses
                                      ?.length > 0 && (
                                      <div>
                                        <h5 className="font-medium text-rose-400 mb-2">
                                          Weaknesses / Missing
                                        </h5>
                                        <ul className="list-disc list-inside space-y-1 text-zinc-400 text-xs">
                                          {r.parsed_json.scoring.breakdown.weaknesses.map(
                                            (w: string, i: number) => (
                                              <li key={i}>{w}</li>
                                            ),
                                          )}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Summary */}
                              {r.parsed_json?.summary && (
                                <div>
                                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                                    Summary
                                  </h4>
                                  <p className="text-sm text-zinc-300 leading-relaxed max-w-3xl">
                                    {r.parsed_json.summary}
                                  </p>
                                </div>
                              )}

                              {/* Experience */}
                              {r.parsed_json?.experience?.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                                    Experience
                                  </h4>
                                  <div className="grid gap-4 md:grid-cols-2">
                                    {r.parsed_json.experience.map(
                                      (exp: any, i: number) => (
                                        <div
                                          key={i}
                                          className="bg-zinc-900/40 rounded-lg p-4 border border-zinc-800/50"
                                        >
                                          <div className="font-medium text-zinc-200">
                                            {exp.role || "Role"}
                                          </div>
                                          <div className="text-sm text-blue-400">
                                            {exp.company || "Company"}
                                          </div>
                                          <div className="text-xs text-zinc-500 mt-1">
                                            {exp.duration}
                                          </div>
                                          {exp.description && (
                                            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                                              {exp.description}
                                            </p>
                                          )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Projects */}
                              {r.parsed_json?.projects?.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                                    Projects
                                  </h4>
                                  <div className="grid gap-4 md:grid-cols-2">
                                    {r.parsed_json.projects.map(
                                      (proj: any, i: number) => (
                                        <div
                                          key={i}
                                          className="bg-zinc-900/40 rounded-lg p-4 border border-zinc-800/50"
                                        >
                                          <div className="font-medium text-zinc-200">
                                            {proj.name || "Project"}
                                          </div>
                                          <div className="flex flex-wrap gap-1 mt-2 mb-2">
                                            {proj.tech_stack?.map(
                                              (t: string, ti: number) => (
                                                <span
                                                  key={ti}
                                                  className="text-[10px] uppercase bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded"
                                                >
                                                  {t}
                                                </span>
                                              ),
                                            )}
                                          </div>
                                          {proj.description && (
                                            <p className="text-xs text-zinc-400 leading-relaxed">
                                              {proj.description}
                                            </p>
                                          )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Education & Certs */}
                              <div className="grid gap-6 md:grid-cols-2">
                                {r.parsed_json?.education?.length > 0 && (
                                  <div>
                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                                      Education
                                    </h4>
                                    <div className="space-y-2">
                                      {r.parsed_json.education.map(
                                        (edu: any, i: number) => (
                                          <div
                                            key={i}
                                            className="bg-zinc-900/40 rounded-lg p-3 border border-zinc-800/50 flex justify-between items-start"
                                          >
                                            <div>
                                              <div className="text-sm font-medium text-zinc-200">
                                                {edu.degree}
                                              </div>
                                              <div className="text-xs text-zinc-400">
                                                {edu.school}
                                              </div>
                                            </div>
                                            <div className="text-xs text-zinc-500 whitespace-nowrap">
                                              {edu.year}
                                            </div>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                )}

                                <div>
                                  {/* Certifications */}
                                  {r.parsed_json?.certifications?.length >
                                    0 && (
                                    <div className="mb-6">
                                      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                                        Certifications
                                      </h4>
                                      <div className="space-y-2">
                                        {r.parsed_json.certifications.map(
                                          (cert: any, i: number) => (
                                            <div
                                              key={i}
                                              className="flex justify-between items-center text-sm"
                                            >
                                              <span className="text-zinc-300">
                                                {cert.name}
                                              </span>
                                              <span className="text-zinc-500 text-xs">
                                                {cert.issuer}{" "}
                                                {cert.year
                                                  ? `(${cert.year})`
                                                  : ""}
                                              </span>
                                            </div>
                                          ),
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Publications */}
                                  {r.parsed_json?.publications?.length > 0 && (
                                    <div>
                                      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                                        Publications
                                      </h4>
                                      <ul className="space-y-2">
                                        {r.parsed_json.publications.map(
                                          (pub: any, i: number) => (
                                            <li key={i} className="text-sm">
                                              <a
                                                href={pub.link || "#"}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-blue-400 hover:underline"
                                              >
                                                {pub.title}
                                              </a>
                                              <span className="text-zinc-500 text-xs ml-2">
                                                {pub.year}
                                              </span>
                                            </li>
                                          ),
                                        )}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Skills Tag Cloud */}
                              {r.parsed_json?.skills?.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                                    Skills
                                  </h4>
                                  <div className="flex flex-wrap gap-1">
                                    {r.parsed_json.skills.map(
                                      (skill: string, i: number) => (
                                        <span
                                          key={i}
                                          className="text-xs bg-zinc-800/60 text-zinc-300 px-2 py-1 rounded-md border border-zinc-700/50"
                                        >
                                          {skill}
                                        </span>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <UploadModal
          open={uploadOpen}
          onClose={() => {
            setUploadOpen(false);
            setFile(null);
          }}
          file={file}
          setFile={setFile}
          uploading={uploading}
          onUpload={upload}
        />

        <JobDetailsModal
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          job={job}
        />

        <EditCandidateModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          candidate={editCandidate}
          onSave={async (id, data) => {
            const res = await fetch(`/api/resumes/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Failed to update");
            await refreshResumes();
          }}
        />

        <DeleteConfirmationModal
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          candidate={deleteCandidate}
          onConfirm={async (id) => {
            const res = await fetch(`/api/resumes/${id}`, {
              method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete");
            await refreshResumes();
          }}
        />

        <DeleteJobConfirmationModal
          open={deleteJobOpen}
          onClose={() => setDeleteJobOpen(false)}
          jobId={jobId}
        />
      </div>
    </div>
  );
}

function ScorePill({ score }: { score: number | null }) {
  const text = score == null ? "-" : String(score);
  const tone =
    score == null
      ? "border-zinc-800 bg-zinc-950/40 text-zinc-200"
      : score >= 80
        ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-200"
        : score >= 60
          ? "border-amber-900/60 bg-amber-950/40 text-amber-200"
          : "border-rose-900/60 bg-rose-950/40 text-rose-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}
    >
      {text}
    </span>
  );
}

function UploadModal(props: {
  open: boolean;
  onClose: () => void;
  file: File | null;
  setFile: (f: File | null) => void;
  uploading: boolean;
  onUpload: (e: React.FormEvent) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!props.open) return null;

  const filename = props.file?.name ?? "No file selected";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70" onClick={props.onClose} />

      <div className="relative w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Upload resumes</div>
            <div className="mt-1 text-sm text-zinc-400">
              Upload a PDF/DOCX/TXT or ZIP containing multiple resumes.
            </div>
          </div>
          <button
            onClick={props.onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm hover:bg-zinc-900/70"
          >
            X
          </button>
        </div>

        <form onSubmit={props.onUpload} className="mt-5 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.zip,application/pdf,application/zip"
            onChange={(e) => props.setFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/20 p-4">
            <div className="text-sm font-semibold">File</div>

            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white"
              >
                Choose file
              </button>

              <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-2 text-sm text-zinc-300">
                {filename}
              </div>

              {props.file && (
                <button
                  type="button"
                  onClick={() => props.setFile(null)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-sm hover:bg-zinc-900/60"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={!props.file || props.uploading}
            className="w-full rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-white disabled:opacity-60"
          >
            {props.uploading ? "Uploading..." : "Upload"}
          </button>

          <div className="text-xs text-zinc-500">
            Tip: Upload a ZIP to add multiple candidates at once.
          </div>
        </form>
      </div>
    </div>
  );
}

function JobDetailsModal(props: {
  open: boolean;
  onClose: () => void;
  job: Job | null;
}) {
  if (!props.open) return null;

  const job = props.job;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70" onClick={props.onClose} />

      <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Job details</div>
            <div className="mt-1 text-sm text-zinc-400">
              Review the job metadata and description.
            </div>
          </div>
          <button
            onClick={props.onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm hover:bg-zinc-900/70"
          >
            X
          </button>
        </div>

        {!job ? (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-sm text-zinc-300">
            Loading...
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Info label="Title" value={job.title} />
              <Info label="Company" value={job.company ?? "-"} />
              <Info label="Location" value={job.location ?? "-"} />
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/20 p-4">
              <div className="text-xs font-semibold text-zinc-400">
                Description
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">
                {job.description}
              </div>
            </div>

            <div className="text-xs text-zinc-500">
              Created: {new Date(job.created_at).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/20 p-4">
      <div className="text-xs font-semibold text-zinc-400">{label}</div>
      <div className="mt-2 text-sm font-semibold text-zinc-200">{value}</div>
    </div>
  );
}

function EditCandidateModal({
  open,
  onClose,
  candidate,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  candidate: ResumeRow | null;
  onSave: (id: string, data: any) => Promise<void>;
}) {
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (candidate) {
      setFormData({
        full_name: candidate.full_name,
        email: candidate.email,
        phone: candidate.phone,
        ...candidate.parsed_json,
      });
    }
  }, [candidate]);

  if (!open || !candidate) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(candidate!.id, formData);
      onClose();
    } catch (error) {
      console.error(error);
      alert("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="text-lg font-semibold">Edit Candidate</div>
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm hover:bg-zinc-900/70"
          >
            X
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-400">Full Name</label>
              <input
                name="full_name"
                value={formData.full_name || ""}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Email</label>
              <input
                name="email"
                value={formData.email || ""}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Phone</label>
              <input
                name="phone"
                value={formData.phone || ""}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Location</label>
              <input
                name="candidate_location"
                value={formData.candidate_location || ""}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Years Experience</label>
              <input
                name="years_experience"
                type="number"
                value={formData.years_experience || 0}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Visa Status</label>
              <select
                name="visa_status"
                value={formData.visa_status || ""}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
              >
                <option value="">Unknown</option>
                <option value="citizen">Citizen</option>
                <option value="green_card">Green Card</option>
                <option value="h1b">H1B</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400">Work Auth</label>
              <select
                name="work_authorization"
                value={formData.work_authorization || ""}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
              >
                <option value="">Unknown</option>
                <option value="authorized">Authorized</option>
                <option value="sponsorship">Sponsorship</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400">Summary</label>
            <textarea
              name="summary"
              rows={4}
              value={formData.summary || ""}
              onChange={handleChange}
              className="w-full mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmationModal({
  open,
  onClose,
  candidate,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  candidate: ResumeRow | null;
  onConfirm: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  if (!open || !candidate) return null;

  async function handleConfirm() {
    setDeleting(true);
    try {
      await onConfirm(candidate!.id);
      onClose();
    } catch (error) {
      console.error(error);
      alert("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="text-lg font-semibold text-red-400">
          Delete Candidate?
        </div>
        <div className="mt-2 text-sm text-zinc-400">
          Are you sure you want to delete{" "}
          <strong className="text-zinc-200">
            {candidate.full_name || candidate.original_filename}
          </strong>
          ? This action cannot be undone.
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-sm hover:bg-zinc-900/70"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteJobConfirmationModal({
  open,
  onClose,
  jobId,
}: {
  open: boolean;
  onClose: () => void;
  jobId: string;
}) {
  const [deleting, setDeleting] = useState(false);
  const router =
    typeof window !== "undefined"
      ? require("next/navigation").useRouter()
      : null;

  if (!open) return null;

  async function handleConfirm() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete job");

      // Redirect to dashboard
      if (router) router.push("/dashboard");
      else window.location.href = "/dashboard";
    } catch (error) {
      console.error(error);
      alert("Failed to delete job");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="text-lg font-semibold text-red-500">Delete Job?</div>
        <div className="mt-2 text-sm text-zinc-400">
          Are you sure you want to delete this job and{" "}
          <strong>ALL candidates</strong>? This action cannot be undone.
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-sm hover:bg-zinc-900/70"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
          >
            {deleting ? "Deleting..." : "Delete Job"}
          </button>
        </div>
      </div>
    </div>
  );
}
