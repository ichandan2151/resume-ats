"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

const formatVisaStatus = (status: string) => {
  if (!status) return "";
  const map: Record<string, string> = {
    citizen: "Citizen",
    green_card: "Green Card",
    h1b: "H1B",
    opt: "OPT",
    stem_opt: "STEM OPT",
    cpt: "CPT",
  };
  return map[status.toLowerCase()] || status;
};

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

type SearchCandidate = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  description: string;
  created_at: string;
};

export default function SearchCandidateClient({ id }: { id: string }) {
  const [rows, setRows] = useState<ResumeRow[]>([]);
  const [selectedSearchResumeIds, setSelectedSearchResumeIds] = useState<Set<string>>(new Set());
  const [deleteMultipleOpen, setDeleteMultipleOpen] = useState(false);
  const [searchCandidate, setSearchCandidate] = useState<SearchCandidate | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [existingIdentifiers, setExistingIdentifiers] = useState<{ email: string | null; original_filename: string }[]>([]);

  const fetchExistingIdentifiers = async () => {
    try {
      const res = await fetch(`/api/search-candidate/${id}/resumes?all=true`);
      const json = await res.json();
      if (res.ok) {
        setExistingIdentifiers(json.data ?? []);
      }
    } catch (e) {
      console.error("Error fetching existing campaign candidates:", e);
    }
  };

  useEffect(() => {
    const tourCompleted = localStorage.getItem("patternix_search_onboarding_completed");
    if (!tourCompleted) {
      setShowTour(true);
    }
  }, []);

  const handleNextTourStep = () => {
    if (tourStep < 5) {
      setTourStep(prev => prev + 1);
    } else {
      handleCompleteTour();
    }
  };

  const handlePrevTourStep = () => {
    if (tourStep > 0) {
      setTourStep(prev => prev - 1);
    }
  };

  const handleCompleteTour = () => {
    localStorage.setItem("patternix_search_onboarding_completed", "true");
    setShowTour(false);
    setTourStep(0);
  };
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [serverAvgScore, setServerAvgScore] = useState<number | null>(null);
  const limit = 30;
  const from = (page - 1) * limit;

  const [initialLoad, setInitialLoad] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);

  // Import from Directory States
  const [importDirectoryOpen, setImportDirectoryOpen] = useState(false);
  const [dirCandidates, setDirCandidates] = useState<any[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [dirPage, setDirPage] = useState(1);
  const [dirTotalPages, setDirTotalPages] = useState(1);
  const [dirTotalCount, setDirTotalCount] = useState(0);
  const [dirSearchQuery, setDirSearchQuery] = useState("");
  const [selectedDirIds, setSelectedDirIds] = useState<Set<string>>(new Set());
  const [importingDir, setImportingDir] = useState(false);

  const fetchDirectoryCandidates = async (pageNumber = 1) => {
    setDirLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/resumes?page=${pageNumber}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to fetch directory candidates");
      setDirCandidates(json.data ?? []);
      setDirTotalPages(json.totalPages ?? 1);
      setDirTotalCount(json.totalCount ?? 0);
      setDirPage(json.page ?? 1);
    } catch (e: any) {
      setErr(e.message ?? "Error fetching directory candidates");
    } finally {
      setDirLoading(false);
    }
  };

  useEffect(() => {
    if (importDirectoryOpen) {
      fetchDirectoryCandidates(dirPage);
    }
  }, [importDirectoryOpen, dirPage]);

  async function handleImportFromDirectory() {
    if (selectedDirIds.size === 0) return;
    setImportingDir(true);
    setErr(null);
    try {
      const res = await fetch(`/api/search-candidate/${id}/resumes/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resumeIds: Array.from(selectedDirIds),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Import failed");
      
      setImportDirectoryOpen(false);
      setSelectedDirIds(new Set());
      await refreshResumes();
    } catch (e: any) {
      setErr(e.message ?? "Failed to import candidates");
    } finally {
      setImportingDir(false);
    }
  }

  const existingEmails = useMemo(() => {
    return new Set(
      existingIdentifiers
        .map((r) => r.email?.trim().toLowerCase())
        .filter(Boolean)
    );
  }, [existingIdentifiers]);

  const existingFilenames = useMemo(() => {
    return new Set(
      existingIdentifiers
        .map((r) => r.original_filename?.trim().toLowerCase())
        .filter(Boolean)
    );
  }, [existingIdentifiers]);

  const isAlreadyInSearch = (c: any) => {
    const email = c.email?.trim().toLowerCase();
    const filename = c.original_filename?.trim().toLowerCase();
    return !!((email && existingEmails.has(email)) || (filename && existingFilenames.has(filename)));
  };

  const [hasOpenedProcessingPopup, setHasOpenedProcessingPopup] = useState(false);
  const [processingPopupOpen, setProcessingPopupOpen] = useState(false);

  const anyProcessing = useMemo(() => {
    return rows.some((r) => r.status === "uploaded" || r.status === "processing");
  }, [rows]);

  const processingCount = useMemo(() => {
    return rows.filter((r) => r.status === "uploaded" || r.status === "processing").length;
  }, [rows]);

  useEffect(() => {
    if (!initialLoad && !hasOpenedProcessingPopup) {
      if (anyProcessing) {
        setProcessingPopupOpen(true);
        setHasOpenedProcessingPopup(true);
      }
    }
  }, [initialLoad, anyProcessing, hasOpenedProcessingPopup]);



  // filters
  const [locationFilter, setLocationFilter] = useState("");
  const [minExpFilter, setMinExpFilter] = useState("");
  const [visaFilter, setVisaFilter] = useState("");
  const [workAuthFilter, setWorkAuthFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters = useMemo(() => {
    return !!(
      locationFilter.trim() ||
      minExpFilter.trim() ||
      visaFilter.trim() ||
      workAuthFilter.trim() ||
      statusFilter.trim()
    );
  }, [locationFilter, minExpFilter, visaFilter, workAuthFilter, statusFilter]);

  function handleClearFilters() {
    setLocationFilter("");
    setMinExpFilter("");
    setVisaFilter("");
    setWorkAuthFilter("");
    setStatusFilter("");
    setPage(1);
    refreshResumes(1).catch(console.error);
  }

  // edit modal
  const [editCandidate, setEditCandidate] = useState<ResumeRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // delete modal
  const [deleteCandidate, setDeleteCandidate] = useState<ResumeRow | null>(
    null,
  );
  const [deleteOpen, setDeleteOpen] = useState(false);

  // delete searchCandidate modal
  const [deleteSearchOpen, setDeleteSearchOpen] = useState(false);

  // retry state
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  // expanded row
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  type SortField = "score" | "status" | null;
  type SortDirection = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const total = totalCount;
  const avgScore = serverAvgScore;

  const sortedRows = rows;

  async function loadSearchCandidate() {
    const res = await fetch(`/api/search-candidate/${id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "Failed to load searchCandidate");
    setSearchCandidate(json.data);
  }

  async function refreshResumes(targetPage = page, field = sortField, direction = sortDirection) {
    const params = new URLSearchParams();
    if (locationFilter.trim())
      params.set("candidate_location", locationFilter.trim());
    if (minExpFilter.trim())
      params.set("years_experience", minExpFilter.trim());
    if (visaFilter.trim()) params.set("visa_status", visaFilter.trim());
    if (workAuthFilter.trim())
      params.set("work_authorization", workAuthFilter.trim());
    if (statusFilter.trim())
      params.set("status", statusFilter.trim());
    params.set("page", String(targetPage));
    if (field) {
      params.set("sort_field", field);
      params.set("sort_direction", direction);
    }

    const res = await fetch(`/api/search-candidate/${id}/resumes?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "Failed to load candidates");
    setRows(json.data ?? []);
    setTotalCount(json.totalCount ?? 0);
    setTotalPages(json.totalPages ?? 1);
    setServerAvgScore(json.avgScore ?? null);
    setSelectedSearchResumeIds(new Set());
    
    // Refresh existing identifiers list
    fetchExistingIdentifiers();
  }

  async function refreshAll() {
    setLoadingList(true);
    setErr(null);
    try {
      await Promise.all([loadSearchCandidate(), refreshResumes(page)]);
    } catch (e: any) {
      setErr(e.message ?? "Error");
    } finally {
      setLoadingList(false);
      setInitialLoad(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!initialLoad) {
      setPage(1);
      refreshResumes(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter, minExpFilter, visaFilter, workAuthFilter, statusFilter, sortField, sortDirection]);

  // Polling mechanism: if any resume is "uploaded", refresh every 5s
  useEffect(() => {
    const isProcessing = rows.some((r) => r.status === "uploaded");
    if (!isProcessing) return;

    const intervalId = setInterval(() => {
      refreshResumes(page);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [rows, page]);

  async function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    setLoadingList(true);
    try {
      await refreshResumes(newPage);
    } catch (e: any) {
      setErr(e.message ?? "Failed to change page");
    } finally {
      setLoadingList(false);
    }
  }



  async function retryResume(resumeId: string) {
    setRetryingIds((prev) => new Set(prev).add(resumeId));
    try {
      const res = await fetch(`/api/resumes/${resumeId}/retry`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Retry failed");
      // Refresh to pick up the "uploaded" status (which triggers polling)
      await refreshResumes();
    } catch (e: any) {
      setErr(e.message ?? "Retry failed");
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(resumeId);
        return next;
      });
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {initialLoad ? (
          <div className="flex flex-col items-center justify-center py-32">
            <svg className="h-8 w-8 animate-spin text-zinc-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div className="mt-4 text-sm text-zinc-400">Loading search details...</div>
          </div>
        ) : (
        <>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <a
              href="/dashboard"
              className="hover:text-zinc-900 dark:hover:text-white transition flex items-center gap-1.5 font-medium"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Dashboard
            </a>
             <span className="text-zinc-400 dark:text-zinc-700">/</span>
            <span className="text-zinc-800 dark:text-zinc-200 font-semibold truncate max-w-[240px]">
              {searchCandidate?.title ?? "Campaign Details"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={() => {
                setTourStep(0);
                setShowTour(true);
              }}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 shadow-sm transition"
            >
              Tour Guide
            </button>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div id="tour-searchCandidate-header" className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {searchCandidate?.title ?? "SearchCandidate"}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                {searchCandidate?.company ?? "No Company"}
              </span>
              {searchCandidate?.location && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-700">•</span>
                  <span>📍 {searchCandidate.location}</span>
                </>
              )}
              <span className="text-zinc-300 dark:text-zinc-700">•</span>
              <span className="flex items-center gap-1">
                <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Created {searchCandidate ? new Date(searchCandidate.created_at).toLocaleDateString() : ""}
              </span>
            </div>

            {/* Campaign Metrics Section */}
            <div id="tour-searchCandidate-metrics" className="flex items-center gap-3 pt-1">
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 dark:bg-violet-950 border border-violet-100 dark:border-violet-800 px-3 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {total} Candidates
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-800 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                Avg Score: {avgScore == null ? "-" : avgScore.toFixed(1)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 lg:self-end">
            <button
              onClick={() => setDetailsOpen(true)}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Search Details
            </button>

            <button
              id="tour-searchCandidate-import"
              onClick={() => {
                setDirPage(1);
                setSelectedDirIds(new Set());
                setImportDirectoryOpen(true);
              }}
              className="rounded-xl bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition flex items-center gap-2 shadow-md shadow-violet-500/10 cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Import Candidates
            </button>

            <button
              onClick={() => setDeleteSearchOpen(true)}
              className="rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 px-4 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-100/60 dark:hover:bg-red-950/30 transition flex items-center gap-2 cursor-pointer"
              title="Delete Search Campaign"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Campaign
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-red-200 dark:border-red-800/30 bg-red-50 dark:bg-red-950/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {err}
          </div>
        )}

        {/* Candidates table */}
        <div id="tour-searchCandidate-table" className="mt-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/20 shadow-sm dark:shadow-none overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-5 py-4">
            <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Candidates
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition cursor-pointer flex items-center gap-1.5 ${
                  hasActiveFilters
                    ? "text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800 bg-violet-50/30 dark:bg-violet-900/20"
                    : "text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/30"
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {hasActiveFilters
                  ? `Filters: ${[locationFilter, minExpFilter, visaFilter, workAuthFilter, statusFilter].filter(Boolean).length} Active`
                  : "Filter"}
              </button>

              <button
                onClick={refreshAll}
                disabled={loadingList}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/30 px-3 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-900/60 disabled:opacity-60 cursor-pointer"
              >
                {loadingList ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          {/* Integrated Collapsible Filters Drawer */}
          {(showFilters || hasActiveFilters) && (
            <div
              id="tour-searchCandidate-filters"
              className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 p-4 grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-5 animate-fade-in"
            >
              <input
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="Filter location..."
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
              />
              <input
                value={minExpFilter}
                onChange={(e) => setMinExpFilter(e.target.value)}
                type="number"
                placeholder="Min Exp (years)"
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
              />
              <select
                value={visaFilter}
                onChange={(e) => setVisaFilter(e.target.value)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
              >
                <option value="">Any Visa Status</option>
                <option value="citizen">Citizen</option>
                <option value="green_card">Green Card</option>
                <option value="h1b">H1B</option>
                <option value="opt">OPT</option>
                <option value="stem_opt">STEM OPT</option>
                <option value="cpt">CPT</option>
              </select>
              <select
                value={workAuthFilter}
                onChange={(e) => setWorkAuthFilter(e.target.value)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
              >
                <option value="">Any Work Auth</option>
                <option value="authorized">Authorized</option>
                <option value="sponsorship">Sponsorship</option>
              </select>
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
                >
                  <option value="">Any Status</option>
                  <option value="scored">Scored</option>
                  <option value="uploaded">Processing</option>
                  <option value="failed">Failed</option>
                </select>
                {hasActiveFilters && (
                  <button
                    onClick={handleClearFilters}
                    className="text-xs text-red-500 hover:text-red-700 font-semibold transition cursor-pointer px-1"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="p-8">
              {hasActiveFilters ? (
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 border-dashed p-8 text-center bg-zinc-50/50 dark:bg-zinc-900/10">
                  <div className="text-3xl mb-3">🔍</div>
                  <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">No candidates available</div>
                  <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    No candidates match your current filters. Try adjusting or clearing your search criteria.
                  </div>
                  <button
                    onClick={handleClearFilters}
                    className="mt-5 rounded-xl bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white transition cursor-pointer"
                  >
                    Clear Filters
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 border-dashed p-8 text-center bg-zinc-50/50 dark:bg-zinc-900/10">
                  <div className="text-3xl mb-3">📂</div>
                  <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">No candidates added yet</div>
                  <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    Import candidates from the Candidate Directory to get started.
                  </div>
                  <button
                    onClick={() => {
                      setDirPage(1);
                      setSelectedDirIds(new Set());
                      setImportDirectoryOpen(true);
                    }}
                    className="mt-5 rounded-xl bg-zinc-950 border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-300 dark:text-zinc-950 hover:bg-zinc-900 dark:hover:bg-white transition cursor-pointer"
                  >
                    Import from Directory
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Candidates table header / Action bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-5 py-3 bg-zinc-50 dark:bg-zinc-950/20 text-xs text-zinc-500 dark:text-zinc-400">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={
                      rows.length > 0 &&
                      rows.every((r) => selectedSearchResumeIds.has(r.id))
                    }
                    ref={(el) => {
                      if (el) {
                        const allSelected =
                          rows.length > 0 &&
                          rows.every((r) => selectedSearchResumeIds.has(r.id));
                        const someSelected =
                          rows.length > 0 &&
                          rows.some((r) => selectedSearchResumeIds.has(r.id)) &&
                          !allSelected;
                        el.indeterminate = someSelected;
                      }
                    }}
                    onChange={() => {
                      const allSelected =
                        rows.length > 0 &&
                        rows.every((r) => selectedSearchResumeIds.has(r.id));
                      if (allSelected) {
                        setSelectedSearchResumeIds(new Set());
                      } else {
                        setSelectedSearchResumeIds(new Set(rows.map((r) => r.id)));
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                  {selectedSearchResumeIds.size > 0 ? (
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">
                        {selectedSearchResumeIds.size} selected
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">|</span>
                      <button
                        type="button"
                        onClick={() => setDeleteMultipleOpen(true)}
                        className="text-red-600 dark:text-red-400 hover:underline cursor-pointer font-semibold"
                      >
                        Delete Selected
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="font-semibold uppercase tracking-wide">Sort:</span>
                      <button
                        onClick={() => {
                          if (sortField === "score") {
                            if (sortDirection === "asc") setSortDirection("desc");
                            else setSortField(null);
                          } else {
                            setSortField("score");
                            setSortDirection("desc");
                          }
                        }}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${sortField === "score" ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100" : "hover:bg-zinc-100 dark:hover:bg-zinc-900/40"}`}
                      >
                        Score {sortField === "score" ? (sortDirection === "asc" ? "↑" : "↓") : "⇅"}
                      </button>
                      <button
                        onClick={() => {
                          if (sortField === "status") {
                            if (sortDirection === "asc") setSortDirection("desc");
                            else setSortField(null);
                          } else {
                            setSortField("status");
                            setSortDirection("desc");
                          }
                        }}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${sortField === "status" ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100" : "hover:bg-zinc-100 dark:hover:bg-zinc-900/40"}`}
                      >
                        Status {sortField === "status" ? (sortDirection === "asc" ? "↑" : "↓") : "⇅"}
                      </button>
                    </div>
                  )}
                </div>

                {selectedSearchResumeIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedSearchResumeIds(new Set())}
                    className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition cursor-pointer sm:ml-auto"
                  >
                    Clear Selection
                  </button>
                )}
              </div>

              {/* Card list */}
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {sortedRows.map((r) => (
                  <Fragment key={r.id}>
                    <div className={`px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/20 transition-colors flex items-start gap-4 ${selectedSearchResumeIds.has(r.id) ? "bg-violet-50/20 dark:bg-violet-950/5" : ""}`}>
                      <input
                        type="checkbox"
                        checked={selectedSearchResumeIds.has(r.id)}
                        onChange={() => {
                          setSelectedSearchResumeIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.id)) next.delete(r.id);
                            else next.add(r.id);
                            return next;
                          });
                        }}
                        className="mt-1 h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-violet-600 focus:ring-violet-500 cursor-pointer flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                      {/* Top row: name + score + status */}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                            {r.full_name ?? "Unknown name"}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                            {r.original_filename}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <ScorePill score={r.score} />
                          {/* Status badge */}
                          {r.status === "uploaded" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400">
                              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Processing
                            </span>
                          ) : (r.status === "failed" || r.status === "error") ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                              </svg>
                              Failed
                            </span>
                          ) : (
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                              r.status === "scored"
                                ? "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                                : "border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950/40 text-zinc-600 dark:text-zinc-300"
                            }`}>
                              {r.status}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Middle row: contact + badges */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                        {r.email && (
                          <span className="text-zinc-500 dark:text-zinc-400">{r.email}</span>
                        )}
                        {r.phone && (
                          <span className="text-zinc-400 dark:text-zinc-500">{r.phone}</span>
                        )}
                        {r.parsed_json?.candidate_location && (
                          <span className="rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300">
                            📍 {r.parsed_json.candidate_location}
                          </span>
                        )}
                        {r.parsed_json?.years_experience != null && r.parsed_json.years_experience > 0 && (
                          <span className="rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300">
                            {r.parsed_json.years_experience}y exp
                          </span>
                        )}
                        {r.parsed_json?.visa_status && (
                          <span className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 text-blue-700 dark:text-blue-300">
                            {formatVisaStatus(r.parsed_json.visa_status)}
                          </span>
                        )}
                        {r.parsed_json?.work_authorization && (
                          <span className="rounded-md bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0.5 text-indigo-700 dark:text-indigo-300">
                            {r.parsed_json.work_authorization}
                          </span>
                        )}
                        {r.parsed_json?.error_code && (
                          <span className="rounded-md bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 text-red-600 dark:text-red-400 font-mono border border-red-200 dark:border-red-900/30">
                            {r.parsed_json.error_code}
                          </span>
                        )}
                      </div>

                      {/* Bottom row: date + actions */}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-zinc-400 dark:text-zinc-500">
                          Uploaded {new Date(r.created_at).toLocaleString()}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}
                            disabled={r.status === "uploaded"}
                            className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {expandedRow === r.id ? "Hide details" : "Show details"}
                            <svg className={`w-3 h-3 transition-transform ${expandedRow === r.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => { setEditCandidate(r); setEditOpen(true); }}
                              disabled={r.status === "uploaded"}
                              className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            >
                              Edit
                            </button>
                            <a
                              href={`/api/resumes/${r.id}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                                r.status === "uploaded"
                                  ? "border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                                  : "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/60"
                              }`}
                              onClick={(e) => { if (r.status === "uploaded") e.preventDefault(); }}
                            >
                              View
                            </a>
                            {(r.status === "failed" || r.status === "error") && (
                              <button
                                onClick={() => retryResume(r.id)}
                                disabled={retryingIds.has(r.id)}
                                className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/40 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 disabled:opacity-50 cursor-pointer"
                              >
                                {retryingIds.has(r.id) ? "Retrying..." : "Retry"}
                              </button>
                            )}
                            <button
                              onClick={() => { setDeleteCandidate(r); setDeleteOpen(true); }}
                              disabled={r.status === "uploaded"}
                              className="rounded-lg border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/40 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                    {/* Error detail panel */}
                    {(r.status === "failed" || r.status === "error") && r.parsed_json?.error && expandedRow === r.id && (
                      <div className="border-t border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/10 px-5 py-4">
                        <div className="border-l-2 border-red-400 dark:border-red-900/50 pl-4">
                          <div className="rounded-xl border border-red-200 dark:border-red-900/30 bg-white dark:bg-red-950/20 p-4">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 rounded-lg bg-red-100 dark:bg-red-900/30 p-1.5">
                                <svg className="h-4 w-4 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-semibold text-red-700 dark:text-red-300">Parsing Failed</h4>
                                  {r.parsed_json.error_code && (
                                    <span className="rounded bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 text-[10px] font-mono text-red-600 dark:text-red-300/80">
                                      {r.parsed_json.error_code}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{r.parsed_json.error}</p>
                                <button
                                  onClick={() => retryResume(r.id)}
                                  disabled={retryingIds.has(r.id)}
                                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/60 disabled:opacity-50 transition-colors"
                                >
                                  <svg className={`h-3.5 w-3.5 ${retryingIds.has(r.id) ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                  {retryingIds.has(r.id) ? "Retrying..." : "Retry Parsing"}
                                </button>
                                {!r.parsed_json.retryable && (
                                  <p className="mt-2 text-xs text-zinc-500">Note: If you have corrected the configuration/API key error, click Retry Parsing above to attempt parsing again.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Detail panel for scored candidates */}
                    {expandedRow === r.id && r.status !== "failed" && r.status !== "error" && (
                      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/10 px-5 py-0">
                        <div className="border-l border-zinc-200 dark:border-zinc-800 pl-6 py-6 space-y-6">
                              {/* Gemini Scoring Breakdown */}
                              {r.parsed_json?.scoring?.breakdown && (
                                <div className="mb-6 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg p-5 border border-blue-200 dark:border-blue-900/20 shadow-sm dark:shadow-none">
                                  <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2 mb-3">
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
                                    <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-4 leading-relaxed">
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
                                        <h5 className="font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                                          Strengths
                                        </h5>
                                        <ul className="list-disc list-inside space-y-1 text-zinc-600 dark:text-zinc-400 text-xs">
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
                                        <h5 className="font-semibold text-rose-700 dark:text-rose-400 mb-2">
                                          Weaknesses / Missing
                                        </h5>
                                        <ul className="list-disc list-inside space-y-1 text-zinc-600 dark:text-zinc-400 text-xs">
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
                                  <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                                    Summary
                                  </h4>
                                  <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-3xl">
                                    {r.parsed_json.summary}
                                  </p>
                                </div>
                              )}

                              {/* Experience */}
                              {r.parsed_json?.experience?.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                                    Experience
                                  </h4>
                                  <div className="grid gap-4 md:grid-cols-2">
                                    {r.parsed_json.experience.map(
                                      (exp: any, i: number) => (
                                        <div
                                          key={i}
                                          className="bg-zinc-50/80 dark:bg-zinc-900/40 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800/50 shadow-sm dark:shadow-none"
                                        >
                                          <div className="font-medium text-zinc-800 dark:text-zinc-200">
                                            {exp.role || "Role"}
                                          </div>
                                          <div className="text-sm text-blue-600 dark:text-blue-400 font-semibold">
                                            {exp.company || "Company"}
                                          </div>
                                          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                            {exp.duration}
                                          </div>
                                          {exp.description && (
                                            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
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
                                  <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                                    Projects
                                  </h4>
                                  <div className="grid gap-4 md:grid-cols-2">
                                    {r.parsed_json.projects.map(
                                      (proj: any, i: number) => (
                                        <div
                                          key={i}
                                          className="bg-zinc-50/80 dark:bg-zinc-900/40 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800/50 shadow-sm dark:shadow-none"
                                        >
                                          <div className="font-medium text-zinc-800 dark:text-zinc-200">
                                            {proj.name || "Project"}
                                          </div>
                                          <div className="flex flex-wrap gap-1 mt-2 mb-2">
                                            {proj.tech_stack?.map(
                                              (t: string, ti: number) => (
                                                <span
                                                  key={ti}
                                                  className="text-[10px] uppercase bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded font-medium"
                                                >
                                                  {t}
                                                </span>
                                              ),
                                            )}
                                          </div>
                                          {proj.description && (
                                            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
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
                                    <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                                      Education
                                    </h4>
                                    <div className="space-y-2">
                                      {r.parsed_json.education.map(
                                        (edu: any, i: number) => (
                                          <div
                                            key={i}
                                            className="bg-zinc-50/80 dark:bg-zinc-900/40 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800/50 flex justify-between items-start shadow-sm dark:shadow-none"
                                          >
                                            <div>
                                              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                                                {edu.degree}
                                              </div>
                                              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                                                {edu.school}
                                              </div>
                                            </div>
                                            <div className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
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
                                      <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                                        Certifications
                                      </h4>
                                      <div className="space-y-2">
                                        {r.parsed_json.certifications.map(
                                          (cert: any, i: number) => (
                                            <div
                                              key={i}
                                              className="flex justify-between items-center text-sm"
                                            >
                                              <span className="text-zinc-700 dark:text-zinc-300">
                                                {cert.name}
                                              </span>
                                              <span className="text-zinc-500 dark:text-zinc-400 text-xs">
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
                                    <div className="mt-6">
                                      <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
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
                                                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                              >
                                                {pub.title}
                                              </a>
                                              <span className="text-zinc-500 dark:text-zinc-400 text-xs ml-2">
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
                                  <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                                    Skills
                                  </h4>
                                  <div className="flex flex-wrap gap-1">
                                    {r.parsed_json.skills.map(
                                      (skill: string, i: number) => (
                                        <span
                                          key={i}
                                          className="text-xs bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700/50 shadow-sm dark:shadow-none"
                                        >
                                          {skill}
                                        </span>
                                      ),
                                    )}
                                   </div>
                                 </div>
                               )}
                             </div>
                           </div>
                       )}
                     </Fragment>
                   ))}
                 </div>
            {/* Pagination Toolbar */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 px-5 py-4 text-sm bg-zinc-50 dark:bg-zinc-950/20">
                <div className="text-zinc-500 dark:text-zinc-400">
                  Showing <span className="font-semibold text-zinc-800 dark:text-zinc-200">{from + 1}</span> to{" "}
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {Math.min(from + rows.length, totalCount)}
                  </span>{" "}
                  of <span className="font-semibold text-zinc-800 dark:text-zinc-200">{totalCount}</span> candidates
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1 || loadingList}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900/70 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Previous
                  </button>
                  <span className="text-zinc-500 dark:text-zinc-400 text-xs px-2">
                    Page <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{page}</span> of{" "}
                    <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{totalPages}</span>
                  </span>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === totalPages || loadingList}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900/70 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>



        <ImportFromDirectoryModal
          open={importDirectoryOpen}
          onClose={() => setImportDirectoryOpen(false)}
          candidates={dirCandidates}
          loading={dirLoading}
          page={dirPage}
          totalPages={dirTotalPages}
          totalCount={dirTotalCount}
          onPageChange={setDirPage}
          searchQuery={dirSearchQuery}
          onSearchChange={setDirSearchQuery}
          selectedIds={selectedDirIds}
          onToggleSelect={(id) => {
            setSelectedDirIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) {
                next.delete(id);
              } else {
                next.add(id);
              }
              return next;
            });
          }}
          onSelectAll={() => {
            setSelectedDirIds((prev) => {
              const next = new Set(prev);
              dirCandidates.forEach((c) => {
                if (!isAlreadyInSearch(c)) {
                  next.add(c.id);
                }
              });
              return next;
            });
          }}
          onDeselectAll={() => {
            setSelectedDirIds(new Set());
          }}
          onImport={handleImportFromDirectory}
          importing={importingDir}
          isAlreadyInSearch={isAlreadyInSearch}
        />

        <SearchDetailsModal
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          searchCandidate={searchCandidate}
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

        <DeleteMultipleConfirmationModal
          open={deleteMultipleOpen}
          onClose={() => setDeleteMultipleOpen(false)}
          count={selectedSearchResumeIds.size}
          onConfirm={async () => {
            await Promise.all(
              Array.from(selectedSearchResumeIds).map((id) =>
                fetch(`/api/resumes/${id}`, {
                  method: "DELETE",
                }).then((res) => {
                  if (!res.ok) throw new Error("Failed to delete candidate");
                })
              )
            );
            setSelectedSearchResumeIds(new Set());
            await refreshResumes();
          }}
        />

        <DeleteSearchConfirmationModal
          open={deleteSearchOpen}
          onClose={() => setDeleteSearchOpen(false)}
          id={id}
          onDeleted={() => { window.location.href = "/dashboard"; }}
        />

        <SearchOnboardingTourModal
          open={showTour}
          step={tourStep}
          onNext={handleNextTourStep}
          onPrev={handlePrevTourStep}
          onClose={handleCompleteTour}
        />

        {/* Processing Request Popup Modal */}
        {processingPopupOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-6 animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setProcessingPopupOpen(false)} />
            <div className="relative w-full max-w-lg rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 p-8 shadow-2xl backdrop-blur-md overflow-hidden text-center text-zinc-900 dark:text-zinc-100">
              {/* background gradient element */}
              <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-violet-400/10 dark:bg-violet-900/20 blur-3xl" />
              <div className="absolute -left-24 -bottom-24 w-72 h-72 rounded-full bg-indigo-400/10 dark:bg-indigo-900/20 blur-3xl" />

              {/* Close button */}
              <button
                onClick={() => setProcessingPopupOpen(false)}
                className="absolute top-4 right-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/40 px-3 py-2 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-900/70 text-zinc-500 dark:text-zinc-400 transition cursor-pointer"
              >
                ✕
              </button>

              <div className="relative z-10 flex flex-col items-center max-w-xl mx-auto">
                {/* Radar Pulsing scan effect */}
                <div className="relative flex items-center justify-center w-20 h-20 mb-6">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-violet-400/20 dark:bg-violet-500/10 animate-ping" />
                  <span className="absolute inline-flex h-14 w-14 rounded-full bg-violet-400/30 dark:bg-violet-500/20 animate-pulse" />
                  <div className="relative rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 dark:from-violet-500 dark:to-indigo-500 p-3.5 shadow-lg shadow-violet-500/30">
                    <svg className="h-7 w-7 text-white animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  </div>
                </div>

                <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  Processing candidates
                </h2>

                <p className="mt-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  We are processing your request and it will take some time. Please be patient, we will email you once we have the top candidate for you.
                </p>

                {/* Status Indicator */}
                <div className="mt-6 w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 p-4 flex items-start gap-3 text-left">
                  <div className="relative flex h-3.5 w-3.5 mt-0.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500"></span>
                  </div>
                  <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-normal">
                    Candidate analysis is in progress. Please allow some time for the evaluation; we will notify you via email as soon as the results are ready.
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-6 w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden relative">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full animate-loading-bar" />
                </div>

                <div className="mt-8 flex w-full gap-3">
                  <button
                    onClick={() => setProcessingPopupOpen(false)}
                    className="w-full rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white px-5 py-3 text-sm font-semibold text-white dark:text-zinc-950 transition cursor-pointer"
                  >
                    View Background Progress
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}

function SearchOnboardingTourModal(props: {
  open: boolean;
  step: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const [coords, setCoords] = useState<{
    highlight: React.CSSProperties;
    tooltip: React.CSSProperties;
    placement: "above" | "below" | "center";
  }>({
    highlight: {},
    tooltip: {},
    placement: "center",
  });

  const steps = [
    {
      title: "Welcome to your Campaign Workspace! 💼",
      description: "This page shows all parsed applicants and scoring metrics for this searchCandidate campaign.",
      icon: "💼",
      gradient: "from-violet-600 to-indigo-600",
      shadow: "shadow-indigo-900/35",
      badge: "Campaign Header",
      targetId: "tour-searchCandidate-header"
    },
    {
      title: "Campaign Metrics 📊",
      description: "Track your applicant pipeline size and average fit score in real-time.",
      icon: "📊",
      gradient: "from-blue-600 to-cyan-600",
      shadow: "shadow-blue-900/35",
      badge: "Real-time Stats",
      targetId: "tour-searchCandidate-metrics"
    },
    {
      title: "Candidate Search Filters 🔍",
      description: "Search and filter candidates dynamically by location, experience, visa status, or processing state.",
      icon: "🔍",
      gradient: "from-fuchsia-600 to-pink-600",
      shadow: "shadow-pink-900/35",
      badge: "Advanced Filters",
      targetId: "tour-searchCandidate-filters"
    },
    {
      title: "Candidates List 👥",
      description: "See all applicants in your pipeline. Click 'Show details' to view parsed work history, projects, education, and detailed AI feedback.",
      icon: "👥",
      gradient: "from-emerald-600 to-teal-600",
      shadow: "shadow-emerald-900/35",
      badge: "Applicant Pipeline",
      targetId: "tour-searchCandidate-table"
    },
    {
      title: "Import Candidates 👥",
      description: "Add candidates to this campaign by selecting them from the Candidate Directory master database.",
      icon: "👥",
      gradient: "from-amber-600 to-orange-600",
      shadow: "shadow-amber-900/35",
      badge: "Add Candidates",
      targetId: "tour-searchCandidate-import"
    },
    {
      title: "Start Scoring Candidates! 🎉",
      description: "You're all set. Import candidates to begin matching and scoring instantly.",
      icon: "⚡",
      gradient: "from-violet-600 to-indigo-600",
      shadow: "shadow-indigo-900/35",
      badge: "Ready",
      targetId: null
    }
  ];

  const current = steps[props.step];

  useEffect(() => {
    if (!props.open) return;

    const updatePosition = () => {
      const stepConfig = steps[props.step];
      if (!stepConfig) return;
      const el = stepConfig.targetId ? document.getElementById(stepConfig.targetId) : null;

      if (el) {
        const rect = el.getBoundingClientRect();
        const scrollY = window.scrollY;
        const scrollX = window.scrollX;

        const highlightStyle: React.CSSProperties = {
          position: "absolute",
          top: `${rect.top + scrollY - 6}px`,
          left: `${rect.left + scrollX - 6}px`,
          width: `${rect.width + 12}px`,
          height: `${rect.height + 12}px`,
          pointerEvents: "none",
          zIndex: 115,
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        };

        const spaceAbove = rect.top;
        const placement = spaceAbove > 260 ? "above" : "below";

        const tooltipWidth = 380;
        const screenWidth = window.innerWidth;
        
        let leftCoord = rect.left + rect.width / 2 - tooltipWidth / 2;
        leftCoord = Math.max(16, Math.min(screenWidth - tooltipWidth - 16, leftCoord));

        let tooltipStyle: React.CSSProperties = {
          position: "absolute",
          left: `${leftCoord + scrollX}px`,
          width: `${tooltipWidth}px`,
          zIndex: 120,
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        };

        if (placement === "above") {
          tooltipStyle.bottom = `${window.innerHeight - (rect.top + scrollY) + 12}px`;
        } else {
          tooltipStyle.top = `${rect.bottom + scrollY + 12}px`;
        }

        el.scrollIntoView({ behavior: "smooth", block: "nearest" });

        setCoords({
          highlight: highlightStyle,
          tooltip: tooltipStyle,
          placement,
        });
      } else {
        setCoords({
          highlight: { display: "none" },
          tooltip: {
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "380px",
            zIndex: 120,
            transition: "all 0.3s ease",
          },
          placement: "center",
        });
      }
    };

    updatePosition();
    const timer = setTimeout(updatePosition, 150);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [props.step, props.open]);

  if (!props.open || !current) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[1px] z-[110]" onClick={props.onClose} />

      <div
        className="rounded-xl border-2 border-violet-500 ring-4 ring-violet-500/20 shadow-[0_0_25px_rgba(139,92,246,0.4)] bg-violet-500/5 transition-all duration-300 animate-pulse pointer-events-none"
        style={coords.highlight}
      />

      <div
        className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl transition-all duration-300 select-none text-zinc-100"
        style={coords.tooltip}
      >
        {coords.placement === "above" && (
          <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-4 h-4 bg-zinc-950 border-r border-b border-zinc-800 rotate-45" />
        )}
        {coords.placement === "below" && (
          <div className="absolute left-1/2 -top-2 -translate-x-1/2 w-4 h-4 bg-zinc-950 border-l border-t border-zinc-800 rotate-45" />
        )}

        <div className="relative z-10 flex justify-between items-center">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
            Campaign Tour
          </span>
          <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-400 border border-zinc-800/80">
            {current.badge}
          </span>
        </div>

        <div className="relative z-10 mt-4 flex gap-4 items-start">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr ${current.gradient} text-2xl shadow ${current.shadow}`}>
            {current.icon}
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white tracking-tight">{current.title}</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {current.description}
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-6 flex items-center justify-between border-t border-zinc-900 pt-4">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === props.step ? "w-4 bg-zinc-100" : "w-1 bg-zinc-800"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {props.step > 0 ? (
              <button
                onClick={props.onPrev}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition cursor-pointer"
              >
                Back
              </button>
            ) : (
              <button
                onClick={props.onClose}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 font-medium transition px-2 cursor-pointer"
              >
                Skip
              </button>
            )}
            <button
              onClick={props.onNext}
              className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-white transition cursor-pointer"
            >
              {props.step === 5 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const activeTheme = (localStorage.getItem("patternix-theme") as "light" | "dark") || "dark";
    setTheme(activeTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("patternix-theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 shadow-md transition-all duration-300 cursor-pointer"
      aria-label="Toggle Theme"
    >
      {theme === "dark" ? (
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
          Light Mode
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
          Dark Mode
        </span>
      )}
    </button>
  );
}

function ScorePill({ score }: { score: number | null }) {
  const text = score == null ? "-" : String(score);
  const tone =
    score == null
      ? "border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950/40 text-zinc-600 dark:text-zinc-300"
      : score >= 80
        ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
        : score >= 60
          ? "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
          : "border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}
    >
      {text}
    </span>
  );
}

function SearchDetailsModal(props: {
  open: boolean;
  onClose: () => void;
  searchCandidate: SearchCandidate | null;
}) {
  const [copied, setCopied] = useState(false);

  if (!props.open) return null;

  const searchCandidate = props.searchCandidate;

  const handleCopy = () => {
    if (searchCandidate) {
      navigator.clipboard.writeText(searchCandidate.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70" onClick={props.onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl text-zinc-900 dark:text-zinc-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Search details</div>
            <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Review the search metadata and description.
            </div>
          </div>
          <button
            onClick={props.onClose}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/70 transition-colors cursor-pointer"
          >
            X
          </button>
        </div>

        {!searchCandidate ? (
          <div className="mt-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 p-4 text-sm text-zinc-700 dark:text-zinc-300">
            Loading...
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Info label="Title" value={searchCandidate.title} />
              <Info label="Company" value={searchCandidate.company ?? "-"} />
              <Info label="Location" value={searchCandidate.location ?? "-"} />
            </div>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/20 p-4 shadow-sm dark:shadow-none flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Campaign ID</div>
                <div className="mt-1.5 text-xs font-mono text-zinc-800 dark:text-zinc-200 select-all truncate">{searchCandidate.id}</div>
              </div>
              <button
                onClick={handleCopy}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer flex-shrink-0"
              >
                {copied ? "Copied!" : "Copy ID"}
              </button>
            </div>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/20 p-4 shadow-sm dark:shadow-none">
              <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Description
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                {searchCandidate.description}
              </div>
            </div>

            <div className="text-xs text-zinc-500">
              Created: {new Date(searchCandidate.created_at).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/20 p-4 shadow-sm dark:shadow-none">
      <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{value}</div>
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
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl text-zinc-900 dark:text-zinc-100">
        <div className="flex items-start justify-between gap-4">
          <div className="text-lg font-semibold">Edit Candidate</div>
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/70 transition-colors cursor-pointer"
          >
            X
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Full Name</label>
              <input
                name="full_name"
                value={formData.full_name || ""}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Email</label>
              <input
                name="email"
                value={formData.email || ""}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Phone</label>
              <input
                name="phone"
                value={formData.phone || ""}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Location</label>
              <input
                name="candidate_location"
                value={formData.candidate_location || ""}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Years Experience</label>
              <input
                name="years_experience"
                type="number"
                value={formData.years_experience || 0}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Visa Status</label>
              <select
                name="visa_status"
                value={formData.visa_status || ""}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
              >
                <option value="">Unknown</option>
                <option value="citizen">Citizen</option>
                <option value="green_card">Green Card</option>
                <option value="h1b">H1B</option>
                <option value="opt">OPT</option>
                <option value="stem_opt">STEM OPT</option>
                <option value="cpt">CPT</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Work Auth</label>
              <select
                name="work_authorization"
                value={formData.work_authorization || ""}
                onChange={handleChange}
                className="w-full mt-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
              >
                <option value="">Unknown</option>
                <option value="authorized">Authorized</option>
                <option value="sponsorship">Sponsorship</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Summary</label>
            <textarea
              name="summary"
              rows={4}
              value={formData.summary || ""}
              onChange={handleChange}
              className="w-full mt-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-zinc-900 dark:bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-60 transition-colors cursor-pointer"
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
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl text-zinc-900 dark:text-zinc-100">
        <div className="text-lg font-semibold text-red-500 dark:text-red-400">
          Delete Candidate?
        </div>
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Are you sure you want to delete{" "}
          <strong className="text-zinc-800 dark:text-zinc-200">
            {candidate.full_name || candidate.original_filename}
          </strong>
          ? This action cannot be undone.
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/40 dark:bg-zinc-900/40 px-4 py-2 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/70 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60 cursor-pointer"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteSearchConfirmationModal({
  open,
  onClose,
  id,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  id: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/search-candidate/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete searchCandidate");

      // Redirect to dashboard
      onDeleted();
    } catch (error) {
      console.error(error);
      alert("Failed to delete searchCandidate");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl text-zinc-900 dark:text-zinc-100">
        <div className="text-lg font-semibold text-red-500 dark:text-red-400">Delete Search campaign?</div>
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Are you sure you want to delete this searchCandidate and{" "}
          <strong className="text-zinc-800 dark:text-zinc-200">ALL candidates</strong>? This action cannot be undone.
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/40 dark:bg-zinc-900/40 px-4 py-2 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/70 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60 cursor-pointer"
          >
            {deleting ? "Deleting..." : "Delete Search Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteMultipleConfirmationModal({
  open,
  onClose,
  count,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    setDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error(error);
      alert("Failed to delete candidates");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl text-zinc-900 dark:text-zinc-100">
        <div className="text-lg font-semibold text-red-500 dark:text-red-400">
          Delete {count} Candidates?
        </div>
        <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Are you sure you want to delete the <strong className="text-zinc-800 dark:text-zinc-200">{count}</strong> selected candidates? This action cannot be undone.
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/40 dark:bg-zinc-900/40 px-4 py-2 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/70"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
          >
            {deleting ? "Deleting..." : "Delete Candidates"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportFromDirectoryModal({
  open,
  onClose,
  candidates,
  loading,
  page,
  totalPages,
  totalCount,
  onPageChange,
  searchQuery,
  onSearchChange,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onImport,
  importing,
  isAlreadyInSearch,
}: {
  open: boolean;
  onClose: () => void;
  candidates: any[];
  loading: boolean;
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (p: number) => void;
  searchQuery: string;
  onSearchChange: (s: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onImport: () => Promise<void>;
  importing: boolean;
  isAlreadyInSearch: (c: any) => boolean;
}) {
  if (!open) return null;

  // Filter candidates locally by search query
  const filtered = candidates.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = c.full_name?.toLowerCase().includes(q) ?? false;
    const emailMatch = c.email?.toLowerCase().includes(q) ?? false;
    const skillsMatch = c.parsed_json?.skills?.some((s: string) => s.toLowerCase().includes(q)) ?? false;
    return nameMatch || emailMatch || skillsMatch;
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl text-zinc-900 dark:text-zinc-100 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Import from Candidate Directory ({totalCount})</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Select candidates from your master database to add to this searchCandidate campaign.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/70 transition-colors cursor-pointer"
          >
            X
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[50vh]">
          {/* Search Bar */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search by name, email, or skills..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Action Row */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between text-xs text-zinc-500 border-b border-zinc-100 dark:border-zinc-850 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="font-semibold text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
                >
                  Select All on Page
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={onDeselectAll}
                  className="font-semibold text-zinc-500 dark:text-zinc-400 hover:underline cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
              <div>
                {selectedIds.size} selected
              </div>
            </div>
          )}

          {/* Candidates List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <svg className="h-6 w-6 animate-spin text-zinc-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="mt-2 text-xs text-zinc-500">Loading master database...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-zinc-500 dark:text-zinc-450">
              No candidates found matching your criteria.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((c) => {
                const inSearch = isAlreadyInSearch(c);
                const isSelected = selectedIds.has(c.id);

                return (
                  <div
                    key={c.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                      inSearch
                        ? "border-zinc-100 dark:border-zinc-900 bg-zinc-50/40 dark:bg-zinc-950/20 opacity-60"
                        : isSelected
                        ? "border-violet-300 dark:border-violet-850 bg-violet-50/10 dark:bg-violet-950/5"
                        : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/20"
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={inSearch}
                      checked={isSelected || inSearch}
                      onChange={() => {
                        if (!inSearch) onToggleSelect(c.id);
                      }}
                      className="mt-1 h-4 w-4 rounded border-zinc-300 dark:border-zinc-850 text-violet-600 focus:ring-violet-500 cursor-pointer disabled:cursor-not-allowed"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                            {c.full_name ?? "Unknown candidate"}
                          </h4>
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                            {c.original_filename}
                          </p>
                        </div>
                        {inSearch && (
                          <span className="rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                            Already in Campaign
                          </span>
                        )}
                      </div>

                      {/* Small metadata block */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {c.email && <span className="truncate max-w-[150px]">{c.email}</span>}
                        {c.parsed_json?.years_experience != null && (
                          <span className="px-1 bg-zinc-100 dark:bg-zinc-800 rounded">{c.parsed_json.years_experience}y exp</span>
                        )}
                        {c.parsed_json?.skills?.slice(0, 3).map((s: string, idx: number) => (
                          <span key={idx} className="px-1 bg-zinc-100 dark:bg-zinc-800 rounded truncate max-w-[80px]">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-zinc-100 dark:border-zinc-850 flex items-center justify-between text-xs text-zinc-500">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
              className="px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900/40 disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <span>
              Showing {candidates.length} of {totalCount} candidates • Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900/40 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}

        {/* Footer actions */}
        <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-900/10">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0 || importing}
            onClick={onImport}
            className="rounded-xl bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-50 dark:text-zinc-950 disabled:opacity-50 hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer"
          >
            {importing ? "Importing..." : `Import Selected (${selectedIds.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
