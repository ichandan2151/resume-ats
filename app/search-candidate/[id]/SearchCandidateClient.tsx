"use client";

import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";

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
  ai_screening: boolean;
};

export default function SearchCandidateClient({ id }: { id: string }) {
  const [rows, setRows] = useState<ResumeRow[]>([]);
  const [selectedSearchResumeIds, setSelectedSearchResumeIds] = useState<Set<string>>(new Set());
  const [deleteMultipleOpen, setDeleteMultipleOpen] = useState(false);
  const [searchCandidate, setSearchCandidate] = useState<SearchCandidate | null>(null);
  const [togglingAi, setTogglingAi] = useState(false);

  const handleToggleAiScreening = async () => {
    if (!searchCandidate) return;
    setTogglingAi(true);
    setErr(null);
    try {
      const newMode = !searchCandidate.ai_screening;
      const res = await fetch(`/api/search-candidate/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aiScreening: newMode,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to toggle AI screening");
      }

      setSearchCandidate(json.data);
      await refreshResumes(page);
    } catch (e: any) {
      setErr(e.message ?? "Error toggling AI screening");
    } finally {
      setTogglingAi(false);
    }
  };
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
  const [displayLimit, setDisplayLimit] = useState<5 | 10 | 20 | "all">("all");
  const [copyPopupCandidate, setCopyPopupCandidate] = useState<ResumeRow | null>(null);
  const [drawerCandidate, setDrawerCandidate] = useState<ResumeRow | null>(null);
  const [drawerTab, setDrawerTab] = useState<"screening" | "log" | "notes" | "email" | "schedule">("screening");
  const [compareMode, setCompareMode] = useState(false);
  const [bulkCallOpen, setBulkCallOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [rubricOpen, setRubricOpen] = useState(false);
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [workflowResult, setWorkflowResult] = useState<any>(null);
  const [semanticSearchOpen, setSemanticSearchOpen] = useState(false);
  const [aiAnalyticsOpen, setAiAnalyticsOpen] = useState(false);

  const total = totalCount;
  const avgScore = serverAvgScore;

  const sortedRows = displayLimit === "all" ? rows : rows.slice(0, displayLimit);

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

        {/* Campaign Header */}
        <div className="mt-8 space-y-5">
          {/* Title Row */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div id="tour-searchCandidate-header" className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                {searchCandidate?.title ?? "SearchCandidate"}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
                <span className="font-medium text-zinc-600 dark:text-zinc-300">
                  {searchCandidate?.company ?? "No Company"}
                </span>
                {searchCandidate?.location && (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-700">·</span>
                    <span>{searchCandidate.location}</span>
                  </>
                )}
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <span>
                  Created {searchCandidate ? new Date(searchCandidate.created_at).toLocaleDateString() : ""}
                </span>
              </div>
            </div>

            {/* Primary Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDetailsOpen(true)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition cursor-pointer"
                title="View search details"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>

              <button
                id="tour-searchCandidate-import"
                onClick={() => {
                  setDirPage(1);
                  setSelectedDirIds(new Set());
                  setImportDirectoryOpen(true);
                }}
                className="rounded-lg bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white px-3.5 py-2 text-xs font-semibold text-white dark:text-zinc-900 transition flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Import
              </button>

              <button
                onClick={() => setDeleteSearchOpen(true)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition cursor-pointer"
                title="Delete campaign"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          {/* Metrics + Tools Bar */}
          <div id="tour-searchCandidate-metrics" className="flex flex-wrap items-center gap-2">
            {/* Metrics */}
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {total}
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Avg: {avgScore == null ? "-" : avgScore.toFixed(1)}
            </div>

            {/* AI Screening Toggle */}
            <button
              onClick={handleToggleAiScreening}
              disabled={togglingAi}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border cursor-pointer select-none transition-all ${
                searchCandidate?.ai_screening
                  ? "bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-300 border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/40"
                  : "bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800"
              } disabled:opacity-60`}
              title="Toggle between AI-powered screening and local keyword matching"
            >
              AI {searchCandidate?.ai_screening ? "ON" : "OFF"}
              {togglingAi && (
                <svg className="h-3 w-3 animate-spin text-current" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
            </button>

            {/* Divider */}
            <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5 hidden sm:block" />

            {/* AI Tools */}
            <button
              onClick={() => setCopilotOpen(true)}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              Copilot
            </button>
            <button
              onClick={() => setSemanticSearchOpen(true)}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Search
            </button>
            <button
              onClick={() => setRubricOpen(true)}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
              Rubric
            </button>
            <button
              onClick={() => setAiAnalyticsOpen(true)}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              Analytics
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-red-200 dark:border-red-800/30 bg-red-50 dark:bg-red-950/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {err}
          </div>
        )}

        {/* Candidates table */}
        <div id="tour-searchCandidate-table" className="mt-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-none overflow-hidden bg-zinc-50/20 dark:bg-zinc-900/10">
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-xs text-zinc-800 dark:text-zinc-200 mr-1">
                        {selectedSearchResumeIds.size} selected
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeleteMultipleOpen(true)}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition cursor-pointer"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkCallOpen(true)}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                      >
                        Bulk Call
                      </button>
                      {selectedSearchResumeIds.size >= 2 && selectedSearchResumeIds.size <= 5 && (
                        <button
                          type="button"
                          onClick={() => setCompareMode(true)}
                          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                        >
                          Compare
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          setWorkflowRunning(true);
                          setWorkflowResult(null);
                          try {
                            const res = await fetch("/api/agent-workflow", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ resumeIds: [...selectedSearchResumeIds], jobId: id }),
                            });
                            const json = await res.json();
                            if (res.ok) {
                              setWorkflowResult(json.data);
                              await refreshResumes(page);
                            }
                          } catch {} finally { setWorkflowRunning(false); }
                        }}
                        disabled={workflowRunning}
                        className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {workflowRunning && (
                          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        )}
                        {workflowRunning ? "Running..." : "AI Workflow"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-6">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Show:</span>
                        {([5, 10, 20, "all"] as const).map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setDisplayLimit(opt)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${displayLimit === opt ? "bg-violet-100 dark:bg-violet-950 text-violet-750 dark:text-violet-300 ring-1 ring-inset ring-violet-700/10" : "hover:bg-zinc-100 dark:hover:bg-zinc-900/40 text-zinc-600 dark:text-zinc-400"}`}
                          >
                            {opt === "all" ? "All" : `Top ${opt}`}
                          </button>
                        ))}
                      </div>
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
              <div className="flex flex-col gap-4 p-5 bg-zinc-50/50 dark:bg-zinc-950/30 overflow-visible [content-visibility:auto]">
                {sortedRows.map((r, idx) => (
                  <CandidateCardModern
                    key={r.id}
                    candidate={r}
                    idx={idx}
                    isSelected={selectedSearchResumeIds.has(r.id)}
                    isExpanded={expandedRow === r.id}
                    isRetrying={retryingIds.has(r.id)}
                    onToggleSelect={(id) => {
                      setSelectedSearchResumeIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                    onToggleExpand={(id) => {
                      setExpandedRow((prev) => (prev === id ? null : id));
                    }}
                    onRetry={retryResume}
                    onShowCopyPopup={setCopyPopupCandidate}
                    onCallCandidate={(c) => { setDrawerCandidate(c); setDrawerTab("screening"); }}
                  />
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
                const isParsing = c.status === "uploaded" || c.status === "processing";
                if (!isAlreadyInSearch(c) && !isParsing) {
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
        {copyPopupCandidate && (
          <CopyContactModal
            open={!!copyPopupCandidate}
            onClose={() => setCopyPopupCandidate(null)}
            candidate={copyPopupCandidate}
          />
        )}
        {drawerCandidate && (
          <CandidateDrawer
            candidate={drawerCandidate}
            jobId={id}
            activeTab={drawerTab}
            onTabChange={setDrawerTab}
            onClose={() => setDrawerCandidate(null)}
          />
        )}
        {bulkCallOpen && (
          <BulkCallModal
            resumeIds={[...selectedSearchResumeIds]}
            jobId={id}
            onClose={() => setBulkCallOpen(false)}
          />
        )}
        {compareMode && (
          <CompareModal
            resumeIds={[...selectedSearchResumeIds]}
            onClose={() => setCompareMode(false)}
          />
        )}
        {copilotOpen && (
          <CopilotPanel jobId={id} onClose={() => setCopilotOpen(false)} />
        )}
        {semanticSearchOpen && (
          <SemanticSearchModal jobId={id} onClose={() => setSemanticSearchOpen(false)} />
        )}
        {rubricOpen && (
          <ScoringRubricModal jobId={id} onClose={() => setRubricOpen(false)} />
        )}
        {aiAnalyticsOpen && (
          <AIAnalyticsModal onClose={() => setAiAnalyticsOpen(false)} />
        )}
        {workflowResult && (
          <WorkflowResultModal data={workflowResult} onClose={() => setWorkflowResult(null)} />
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
                {searchCandidate.description.split("---KEYWORDS---")[0].trim()}
              </div>
            </div>

            {(() => {
              const parts = searchCandidate.description.split("---KEYWORDS---");
              if (parts.length > 1) {
                try {
                  const kw = JSON.parse(parts[1].trim());
                  if (Array.isArray(kw) && kw.length > 0) {
                    return (
                      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/20 p-4 shadow-sm dark:shadow-none mt-4">
                        <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">
                          Extracted Keywords
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {kw.map((k) => (
                            <span
                              key={k}
                              className="inline-flex items-center rounded-md bg-violet-50 dark:bg-violet-950 px-2 py-0.5 text-xs font-medium text-violet-750 dark:text-violet-300 ring-1 ring-inset ring-violet-750/10"
                            >
                              {k}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  }
                } catch (e) {}
              }
              return null;
            })()}

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
                const isParsing = c.status === "uploaded" || c.status === "processing";

                return (
                  <div
                    key={c.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                      inSearch || isParsing
                        ? "border-zinc-100 dark:border-zinc-900 bg-zinc-50/40 dark:bg-zinc-950/20 opacity-60"
                        : isSelected
                        ? "border-violet-300 dark:border-violet-850 bg-violet-50/10 dark:bg-violet-950/5"
                        : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/20"
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={inSearch || isParsing}
                      checked={isSelected || inSearch}
                      onChange={() => {
                        if (!inSearch && !isParsing) onToggleSelect(c.id);
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
                        {inSearch ? (
                          <span className="rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                            Already in Campaign
                          </span>
                        ) : isParsing ? (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                            <svg className="h-3 w-3 animate-spin text-blue-500" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Parsing...
                          </span>
                        ) : null}
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

type CandidateCardProps = {
  candidate: ResumeRow;
  idx: number;
  isSelected: boolean;
  isExpanded: boolean;
  isRetrying: boolean;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onRetry: (id: string) => void;
  onShowCopyPopup: (candidate: ResumeRow) => void;
  onCallCandidate: (candidate: ResumeRow) => void;
};

const MatchDetails = React.memo(({ candidate, isExpanded, isRetrying, onRetry }: { candidate: ResumeRow; isExpanded: boolean; isRetrying: boolean; onRetry: (id: string) => void }) => {
  if (!isExpanded) return null;

  const r = candidate;
  return (
    <>
      {/* Error detail panel */}
      {(r.status === "failed" || r.status === "error") && r.parsed_json?.error && (
        <div className="border-t border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/10 px-5 py-4">
          <div className="border-l-2 border-red-400 dark:border-red-900/50 pl-4">
            <div className="rounded-xl border border-red-200 dark:border-red-900/30 bg-white dark:bg-red-950/20 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-red-100 dark:bg-red-900/30 p-1.5 flex-shrink-0">
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
                    onClick={() => onRetry(r.id)}
                    disabled={isRetrying}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/60 disabled:opacity-50 transition-colors"
                  >
                    <svg className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {isRetrying ? "Retrying..." : "Retry Parsing"}
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
      {r.status !== "failed" && r.status !== "error" && (
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
                      Keyword Match Analysis - {r.score}/100
                    </h4>

                    {r.parsed_json.scoring.breakdown.relevance && (
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-4 leading-relaxed font-semibold">
                        {r.parsed_json.scoring.breakdown.relevance}
                      </p>
                    )}

                    <div className="grid md:grid-cols-2 gap-4 text-sm mt-4">
                      {r.parsed_json.scoring.breakdown.strengths?.length > 0 && (
                        <div>
                          <h5 className="font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                            Matched Keywords
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

                      {r.parsed_json.scoring.breakdown.weaknesses?.length > 0 && (
                        <div>
                          <h5 className="font-semibold text-rose-750 dark:text-rose-450 mb-2">
                            Missing Keywords
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
                    {r.parsed_json?.certifications?.length > 0 && (
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
                                <span className="text-zinc-500 dark:text-zinc-400 text-xs ml-2">
                                  {cert.issuer}{" "}
                                  {cert.year ? `(${cert.year})` : ""}
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
    </>
  );
});

MatchDetails.displayName = "MatchDetails";

const CandidateCardModern = React.memo(({ candidate, idx, isSelected, isExpanded, isRetrying, onToggleSelect, onToggleExpand, onRetry, onShowCopyPopup, onCallCandidate }: CandidateCardProps) => {
  const r = candidate;
  return (
    <div className="candidate-card-deferred card-modern" data-id={r.id}>
      <div className={`p-5 rounded-2xl border border-zinc-250 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex items-start gap-5 ${isSelected ? "ring-2 ring-violet-500 bg-violet-50/10 dark:bg-violet-950/5" : ""}`}>
        {/* Checkbox */}
        <div className="pt-1 flex-shrink-0">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(r.id)}
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-violet-600 focus:ring-violet-500 cursor-pointer"
          />
        </div>

        {/* Score Indicator Ring */}
        <div className="flex-shrink-0 relative flex items-center justify-center">
          <svg className="w-14 h-14 transform -rotate-90">
            <circle
              cx="28"
              cy="28"
              r="24"
              className="stroke-zinc-100 dark:stroke-zinc-800/60"
              strokeWidth="4.5"
              fill="transparent"
            />
            <circle
              cx="28"
              cy="28"
              r="24"
              className={
                (r.score ?? 0) >= 70
                  ? "stroke-emerald-500"
                  : (r.score ?? 0) >= 40
                  ? "stroke-amber-500"
                  : "stroke-rose-500"
              }
              strokeWidth="4.5"
              fill="transparent"
              strokeDasharray="150.8"
              strokeDashoffset={150.8 * (1 - (r.score ?? 0) / 100)}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute text-xs font-bold text-zinc-800 dark:text-zinc-200">
            {r.score ?? 0}%
          </span>
        </div>

        {/* Candidate Details */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                <span className="text-zinc-400 dark:text-zinc-500">#{idx + 1}</span>
                {r.full_name ?? "Unknown name"}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {r.original_filename}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Status Badge */}
              {r.status === "uploaded" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400">
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing
                </span>
              ) : (r.status === "failed" || r.status === "error") ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 text-xs font-semibold text-red-650 dark:text-red-400">
                  Failed
                </span>
              ) : null}
            </div>
          </div>

          {/* Contact Info & Badges */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {r.email && (
              <button
                type="button"
                onClick={() => onShowCopyPopup(r)}
                className="flex items-center gap-1 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-250/60 dark:border-zinc-800 px-2 py-0.5 text-zinc-650 dark:text-zinc-350 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition cursor-pointer font-medium"
                title="Click to copy contact details"
              >
                ✉️ {r.email}
              </button>
            )}
            {r.phone && (
              <button
                type="button"
                onClick={() => onShowCopyPopup(r)}
                className="flex items-center gap-1 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-250/60 dark:border-zinc-800 px-2 py-0.5 text-zinc-650 dark:text-zinc-350 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition cursor-pointer font-medium"
                title="Click to copy contact details"
              >
                📞 {r.phone}
              </button>
            )}
            {r.parsed_json?.candidate_location && (
              <span className="rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-250/60 dark:border-zinc-800 px-2 py-0.5 text-zinc-700 dark:text-zinc-350">
                📍 {r.parsed_json.candidate_location}
              </span>
            )}
            {r.parsed_json?.years_experience != null && r.parsed_json.years_experience > 0 && (
              <span className="rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/40 px-2 py-0.5 text-violet-700 dark:text-violet-300 font-semibold">
                💼 {r.parsed_json.years_experience}y exp
              </span>
            )}
            {r.parsed_json?.visa_status && (
              <span className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-2 py-0.5 text-blue-700 dark:text-blue-300 font-semibold">
                {formatVisaStatus(r.parsed_json.visa_status)}
              </span>
            )}
            {r.parsed_json?.work_authorization && (
              <span className="rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 text-indigo-700 dark:text-indigo-300 font-semibold">
                {r.parsed_json.work_authorization}
              </span>
            )}
          </div>

          {/* Footer details toggler & actions */}
          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
            <button
              onClick={() => onToggleExpand(r.id)}
              disabled={r.status === "uploaded"}
              className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-350 disabled:opacity-40 cursor-pointer"
            >
              {isExpanded ? "Hide Match Details" : "Show Match Details"}
              <svg className={`w-3.5 h-3.5 transition-transform duration-250 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div className="flex items-center gap-2">
              {(r.phone || r.parsed_json?.phone) && (
                <button
                  onClick={() => onCallCandidate(r)}
                  disabled={r.status === "uploaded"}
                  className={`inline-flex items-center gap-1 rounded-xl px-3.5 py-1.5 text-xs font-bold shadow-sm transition-all duration-200 border ${
                    r.status === "uploaded"
                      ? "border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                      : "border-emerald-200 dark:border-emerald-800 bg-emerald-500 text-white hover:bg-emerald-600 hover:shadow-md cursor-pointer hover:-translate-y-0.5"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Call
                </button>
              )}
              <a
                href={`/api/resumes/${r.id}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 rounded-xl px-3.5 py-1.5 text-xs font-bold shadow-sm transition-all duration-200 border ${
                  r.status === "uploaded"
                    ? "border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                    : "border-violet-200 dark:border-violet-800 bg-violet-500 text-white hover:bg-violet-600 hover:shadow-md cursor-pointer hover:-translate-y-0.5"
                }`}
                onClick={(e) => { if (r.status === "uploaded") e.preventDefault(); }}
              >
                View Resume
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
      <MatchDetails candidate={r} isExpanded={isExpanded} isRetrying={isRetrying} onRetry={onRetry} />
    </div>
  );
});

CandidateCardModern.displayName = "CandidateCardModern";

function CopyContactModal({
  open,
  onClose,
  candidate,
}: {
  open: boolean;
  onClose: () => void;
  candidate: ResumeRow | null;
}) {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  useEffect(() => {
    setCopiedEmail(false);
    setCopiedPhone(false);
  }, [candidate]);

  if (!open || !candidate) return null;

  const handleCopy = async (text: string, type: "email" | "phone") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "email") {
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2000);
      } else {
        setCopiedPhone(true);
        setTimeout(() => setCopiedPhone(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6 animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-md rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-950/95 p-6 shadow-2xl backdrop-blur-md overflow-hidden text-zinc-900 dark:text-zinc-100">
        {/* Glow Effects */}
        <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-violet-500/10 dark:bg-violet-500/10 blur-2xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-48 h-48 rounded-full bg-indigo-500/10 dark:bg-indigo-500/10 blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-zinc-105 dark:border-zinc-800/80">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
              Contact Details
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              For {candidate.full_name ?? "Unknown candidate"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/40 px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-900/70 transition cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="mt-5 space-y-4">
          {/* Email Row */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Email Address
            </label>
            {candidate.email ? (
              <div className="mt-1.5 flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-850 bg-zinc-50/50 dark:bg-zinc-900/30 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition">
                <span className="text-sm font-medium text-zinc-850 dark:text-zinc-200 truncate select-all">
                  {candidate.email}
                </span>
                <button
                  onClick={() => handleCopy(candidate.email!, "email")}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-sm cursor-pointer ${
                    copiedEmail
                      ? "bg-emerald-500 text-white shadow-emerald-500/10"
                      : "bg-violet-600 text-white hover:bg-violet-750 shadow-violet-500/10"
                  }`}
                >
                  {copiedEmail ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="mt-1.5 text-sm text-zinc-400 dark:text-zinc-500 italic p-3 border border-zinc-150 dark:border-zinc-850/50 rounded-2xl">
                No email available
              </div>
            )}
          </div>

          {/* Phone Row */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Phone Number
            </label>
            {candidate.phone ? (
              <div className="mt-1.5 flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-850 bg-zinc-50/50 dark:bg-zinc-900/30 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition">
                <span className="text-sm font-medium text-zinc-850 dark:text-zinc-200 truncate select-all">
                  {candidate.phone}
                </span>
                <button
                  onClick={() => handleCopy(candidate.phone!, "phone")}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-sm cursor-pointer ${
                    copiedPhone
                      ? "bg-emerald-500 text-white shadow-emerald-500/10"
                      : "bg-violet-600 text-white hover:bg-violet-750 shadow-violet-500/10"
                  }`}
                >
                  {copiedPhone ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="mt-1.5 text-sm text-zinc-400 dark:text-zinc-500 italic p-3 border border-zinc-150 dark:border-zinc-850/50 rounded-2xl">
                No phone number available
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-5 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/70 transition cursor-pointer text-center"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_SCREENING_QUESTIONS = [
  "Do you require visa sponsorship to work in the United States?",
  "What is your current work authorization status?",
  "What is your earliest available start date?",
  "What are your salary expectations for this role?",
  "Are you open to relocation if required?",
];

type VoiceCallRow = {
  id: string;
  vapi_call_id: string;
  candidate_name: string;
  candidate_phone: string;
  status: string;
  questions: string[];
  answers: Record<string, string> | null;
  transcript: string | null;
  summary: string | null;
  call_duration_seconds: number | null;
  cost: number | null;
  ended_reason: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  ringing: "Ringing",
  "in-progress": "In Progress",
  ended: "Completed",
  failed: "Failed",
};

const STATUS_COLOR: Record<string, string> = {
  queued: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  ringing: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  "in-progress": "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  ended: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  failed: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
};

type DrawerTab = "screening" | "log" | "notes" | "email" | "schedule";

function CandidateDrawer({
  candidate,
  jobId,
  activeTab,
  onTabChange,
  onClose,
}: {
  candidate: ResumeRow;
  jobId: string;
  activeTab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
}) {
  const phone = candidate.phone || candidate.parsed_json?.phone;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-[2px] transition-opacity" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-[100] w-full max-w-xl flex flex-col bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl animate-[slideIn_0.2s_ease-out]">
        {/* Header */}
        <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {candidate.full_name || "Unknown Candidate"}
              </h2>
              <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {candidate.email && (
                  <span className="truncate">{candidate.email}</span>
                )}
                {phone && (
                  <span className="shrink-0">{phone}</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 ml-4 rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex px-6 gap-1 overflow-x-auto">
            {([
              { key: "screening" as const, label: "Call", icon: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" },
              { key: "log" as const, label: "History", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
              { key: "notes" as const, label: "Notes", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
              { key: "email" as const, label: "Email", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
              { key: "schedule" as const, label: "Schedule", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition cursor-pointer ${
                  activeTab === tab.key
                    ? "border-violet-500 text-violet-600 dark:text-violet-400"
                    : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "screening" && (
            <ScreeningTab candidate={candidate} jobId={jobId} phone={phone} onCallStarted={() => onTabChange("log")} />
          )}
          {activeTab === "log" && (
            <CallLogTab candidate={candidate} />
          )}
          {activeTab === "notes" && (
            <NotesTab candidate={candidate} jobId={jobId} />
          )}
          {activeTab === "email" && (
            <EmailTab candidate={candidate} jobId={jobId} />
          )}
          {activeTab === "schedule" && (
            <ScheduleTab candidate={candidate} jobId={jobId} />
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

function ScreeningTab({
  candidate,
  jobId,
  phone,
  onCallStarted,
}: {
  candidate: ResumeRow;
  jobId: string;
  phone: string | null;
  onCallStarted: () => void;
}) {
  const [questions, setQuestions] = useState<string[]>(DEFAULT_SCREENING_QUESTIONS.slice(0, 3));
  const [newQuestion, setNewQuestion] = useState("");
  const [calling, setCalling] = useState(false);
  const [callStatus, setCallStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startCall = async () => {
    if (!questions.length) {
      setError("Add at least one question");
      return;
    }
    setCalling(true);
    setError(null);
    setCallStatus("queued");

    try {
      const res = await fetch("/api/voice-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: candidate.id, jobId, questions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to initiate call");

      const voiceCallId = json.data.id;

      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/voice-call/${voiceCallId}`);
          const pollJson = await pollRes.json();
          if (pollRes.ok && pollJson.data) {
            setCallStatus(pollJson.data.status);
            if (pollJson.data.status === "ended" || pollJson.data.status === "failed") {
              setCalling(false);
              if (pollRef.current) clearInterval(pollRef.current);
              // Switch to call log to see results
              setTimeout(() => onCallStarted(), 500);
            }
          }
        } catch {}
      }, 3000);
    } catch (err: any) {
      setError(err.message);
      setCalling(false);
      setCallStatus(null);
    }
  };

  const addQuestion = () => {
    const q = newQuestion.trim();
    if (!q) return;
    setQuestions((prev) => [...prev, q]);
    setNewQuestion("");
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="p-6 space-y-5">
      {/* Live call status */}
      {callStatus && (
        <div className={`flex items-center gap-2 p-3 rounded-xl border ${STATUS_COLOR[callStatus] || "bg-zinc-50 border-zinc-200 text-zinc-600"}`}>
          {callStatus !== "ended" && callStatus !== "failed" && (
            <div className="w-2.5 h-2.5 rounded-full bg-current animate-pulse" />
          )}
          {callStatus === "ended" && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          <span className="text-sm font-semibold">
            {STATUS_LABEL[callStatus] || callStatus}
          </span>
          {callStatus === "ended" && (
            <span className="text-xs ml-auto opacity-70">Switching to Call Log...</span>
          )}
        </div>
      )}

      {/* Questions */}
      <div>
        <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Questions to ask</h4>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={i} className="flex items-start gap-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 border border-zinc-200 dark:border-zinc-700 group">
              <span className="text-xs font-bold text-violet-600 dark:text-violet-400 mt-0.5 shrink-0 w-5 text-center">{i + 1}.</span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1">{q}</span>
              <button
                onClick={() => removeQuestion(i)}
                disabled={calling}
                className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 dark:group-hover:text-zinc-500 hover:!text-red-500 transition shrink-0 cursor-pointer disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {questions.length === 0 && (
            <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-4">No questions added yet</p>
          )}
        </div>
      </div>

      {/* Add question */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addQuestion(); }}
          placeholder="Type a custom question..."
          disabled={calling}
          className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-40"
        />
        <button
          onClick={addQuestion}
          disabled={calling || !newQuestion.trim()}
          className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-500 text-white px-4 py-2.5 text-sm font-semibold hover:bg-violet-600 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>

      {/* AI Smart Questions */}
      <button
        onClick={async () => {
          setGeneratingQuestions(true);
          try {
            const res = await fetch("/api/smart-questions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ resumeId: candidate.id, jobId }),
            });
            const json = await res.json();
            if (res.ok && json.data?.questions) {
              setQuestions((prev) => {
                const newQs = json.data.questions.filter((q: string) => !prev.includes(q));
                return [...prev, ...newQs];
              });
            }
          } catch {} finally {
            setGeneratingQuestions(false);
          }
        }}
        disabled={calling || generatingQuestions}
        className="w-full rounded-xl border border-dashed border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/20 px-4 py-2.5 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-950/40 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        {generatingQuestions ? (
          <>
            <div className="w-4 h-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
            Analyzing resume...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            AI: Suggest Smart Questions
          </>
        )}
      </button>

      {/* Quick-add presets */}
      {DEFAULT_SCREENING_QUESTIONS.filter((q) => !questions.includes(q)).length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-2">Preset questions:</p>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_SCREENING_QUESTIONS.filter((q) => !questions.includes(q)).map((q) => (
              <button
                key={q}
                onClick={() => setQuestions((prev) => [...prev, q])}
                disabled={calling}
                className="text-xs rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 px-2.5 py-1.5 text-zinc-500 dark:text-zinc-400 hover:border-violet-400 dark:hover:border-violet-600 hover:text-violet-600 dark:hover:text-violet-400 transition cursor-pointer disabled:opacity-40"
              >
                + {q.length > 45 ? q.slice(0, 45) + "..." : q}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-xl p-3 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Start call button */}
      <div className="pt-2">
        <button
          onClick={startCall}
          disabled={calling || !phone || questions.length === 0}
          className="w-full rounded-xl bg-emerald-500 text-white py-3 text-sm font-bold hover:bg-emerald-600 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shadow-sm"
        >
          {calling ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Calling {candidate.full_name || "candidate"}...
            </>
          ) : (
            <>
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Start Screening Call
            </>
          )}
        </button>
        {!phone && (
          <p className="text-xs text-amber-600 dark:text-amber-400 text-center mt-2">No phone number available for this candidate</p>
        )}
      </div>
    </div>
  );
}

function CallLogTab({ candidate }: { candidate: ResumeRow }) {
  const [calls, setCalls] = useState<VoiceCallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  useEffect(() => {
    fetchCalls();
  }, [candidate.id]);

  const fetchCalls = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/voice-call?resumeId=${candidate.id}`);
      const json = await res.json();
      if (res.ok) {
        setCalls(json.data || []);
        // Auto-expand the most recent call
        if (json.data?.length > 0) {
          setExpandedCallId(json.data[0].id);
        }
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No calls yet</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Start a screening call from the Screening Call tab</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between px-2 mb-1">
        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          {calls.length} call{calls.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={fetchCalls}
          className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-semibold cursor-pointer"
        >
          Refresh
        </button>
      </div>

      {calls.map((call) => {
        const isExpanded = expandedCallId === call.id;
        const date = new Date(call.created_at);
        const timeStr = date.toLocaleString("en-US", {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
        });

        return (
          <div key={call.id} className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900/50">
            {/* Call header - always visible */}
            <button
              onClick={() => setExpandedCallId(isExpanded ? null : call.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition cursor-pointer text-left"
            >
              <div className={`shrink-0 w-2 h-2 rounded-full ${
                call.status === "ended" ? "bg-emerald-500" :
                call.status === "failed" ? "bg-red-500" :
                "bg-amber-500 animate-pulse"
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${STATUS_COLOR[call.status] || "bg-zinc-100 text-zinc-600 border-zinc-200"}`}>
                    {STATUS_LABEL[call.status] || call.status}
                  </span>
                  {call.call_duration_seconds != null && (
                    <span className="text-xs text-zinc-400">
                      {Math.floor(call.call_duration_seconds / 60)}m {call.call_duration_seconds % 60}s
                    </span>
                  )}
                  {call.cost != null && (
                    <span className="text-xs text-zinc-400">${Number(call.cost).toFixed(3)}</span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{timeStr}</p>
              </div>
              <svg className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-4 space-y-4">
                {/* Questions asked */}
                {call.questions?.length > 0 && (
                  <div>
                    <h5 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Questions Asked</h5>
                    <ol className="space-y-1">
                      {call.questions.map((q: string, i: number) => (
                        <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400 flex gap-2">
                          <span className="text-violet-500 font-semibold shrink-0">{i + 1}.</span>
                          {q}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Summary */}
                {call.summary && (
                  <div>
                    <h5 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Summary</h5>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700 leading-relaxed">
                      {call.summary}
                    </p>
                  </div>
                )}

                {/* Extracted answers */}
                {call.answers && Object.keys(call.answers).length > 0 && (
                  <div>
                    <h5 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Extracted Answers</h5>
                    <div className="space-y-2">
                      {Object.entries(call.answers).map(([key, val]) => (
                        <div key={key} className="bg-violet-50 dark:bg-violet-950/20 rounded-lg p-3 border border-violet-200 dark:border-violet-800/50">
                          <div className="text-xs font-semibold text-violet-600 dark:text-violet-400 mb-0.5">{key}</div>
                          <div className="text-sm text-zinc-700 dark:text-zinc-300">{String(val)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transcript */}
                {call.transcript && (
                  <div>
                    <h5 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Transcript</h5>
                    <pre className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700 whitespace-pre-wrap max-h-64 overflow-y-auto font-sans leading-relaxed">
                      {call.transcript}
                    </pre>
                  </div>
                )}

                {/* No data yet */}
                {call.status !== "ended" && !call.summary && !call.transcript && (
                  <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-2">
                    {call.status === "failed" ? "Call failed — no data available" : "Call in progress — data will appear when complete"}
                  </p>
                )}

                {call.status === "ended" && !call.summary && !call.transcript && (
                  <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-2">
                    No transcript or summary available for this call
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NotesTab({ candidate, jobId }: { candidate: ResumeRow; jobId: string }) {
  const [notes, setNotes] = useState<{ id: string; content: string; created_at: string; updated_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  useEffect(() => { fetchNotes(); }, [candidate.id]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notes?resumeId=${candidate.id}&jobId=${jobId}`);
      const json = await res.json();
      if (res.ok) setNotes(json.data || []);
    } catch {} finally { setLoading(false); }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: candidate.id, jobId, content: newNote.trim() }),
      });
      if (res.ok) {
        setNewNote("");
        fetchNotes();
      }
    } catch {} finally { setSaving(false); }
  };

  const updateNote = async (id: string) => {
    if (!editContent.trim()) return;
    try {
      await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      setEditingId(null);
      fetchNotes();
    } catch {}
  };

  const deleteNote = async (id: string) => {
    try {
      await fetch(`/api/notes/${id}`, { method: "DELETE" });
      fetchNotes();
    } catch {}
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-5 space-y-4">
      {/* Add note */}
      <div className="space-y-2">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note about this candidate..."
          rows={3}
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
        />
        <button
          onClick={addNote}
          disabled={saving || !newNote.trim()}
          className="rounded-xl bg-violet-500 text-white px-4 py-2 text-sm font-semibold hover:bg-violet-600 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Add Note"}
        </button>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No notes yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-zinc-200 dark:border-zinc-700 group">
              {editingId === note.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => updateNote(note.id)} className="text-xs font-semibold text-violet-600 hover:text-violet-700 cursor-pointer">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs font-semibold text-zinc-400 hover:text-zinc-600 cursor-pointer">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{note.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-zinc-400">
                      {new Date(note.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => { setEditingId(note.id); setEditContent(note.content); }} className="text-xs text-zinc-400 hover:text-violet-600 cursor-pointer">Edit</button>
                      <button onClick={() => deleteNote(note.id)} className="text-xs text-zinc-400 hover:text-red-500 cursor-pointer">Delete</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailTab({ candidate, jobId }: { candidate: ResumeRow; jobId: string }) {
  const [templates, setTemplates] = useState<{ id: string; name: string; subject: string; body: string; category: string }[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailLogs, setEmailLogs] = useState<{ id: string; subject: string; created_at: string; status: string }[]>([]);

  // Template manager state
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplSubject, setTplSubject] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [tplCategory, setTplCategory] = useState("general");
  const [tplSaving, setTplSaving] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);

  const candidateEmail = candidate.email || candidate.parsed_json?.email;

  useEffect(() => {
    fetchTemplates();
    fetchEmailLogs();
  }, [candidate.id]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/email-templates");
      const json = await res.json();
      if (res.ok) setTemplates(json.templates || []);
    } catch {}
  };

  const resetTplForm = () => {
    setEditingTemplate(null);
    setTplName("");
    setTplSubject("");
    setTplBody("");
    setTplCategory("general");
    setTplError(null);
  };

  const startEditTemplate = (t: typeof templates[0]) => {
    setEditingTemplate(t.id);
    setTplName(t.name);
    setTplSubject(t.subject);
    setTplBody(t.body);
    setTplCategory(t.category || "general");
    setTplError(null);
  };

  const saveTemplate = async () => {
    if (!tplName.trim() || !tplSubject.trim() || !tplBody.trim()) {
      setTplError("Name, subject, and body are required");
      return;
    }
    setTplSaving(true);
    setTplError(null);
    try {
      const payload = { name: tplName.trim(), subject: tplSubject.trim(), body: tplBody.trim(), category: tplCategory };
      const res = editingTemplate
        ? await fetch(`/api/email-templates/${editingTemplate}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/email-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save template");
      resetTplForm();
      fetchTemplates();
    } catch (err: any) {
      setTplError(err.message);
    } finally {
      setTplSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/email-templates/${id}`, { method: "DELETE" });
      if (!res.ok) { const json = await res.json(); throw new Error(json.error); }
      if (selectedTemplate === id) setSelectedTemplate(null);
      fetchTemplates();
    } catch {}
  };

  const fetchEmailLogs = async () => {
    try {
      const res = await fetch(`/api/email/send?resumeId=${candidate.id}`);
      // This endpoint doesn't exist for GET yet, so we'll use email_logs
    } catch {}
  };

  const applyTemplate = (templateId: string) => {
    const t = templates.find((t) => t.id === templateId);
    if (!t) return;
    setSelectedTemplate(templateId);
    // Replace merge fields
    let s = t.subject;
    let b = t.body;
    const replacements: Record<string, string> = {
      "{{name}}": candidate.full_name || "Candidate",
      "{{email}}": candidateEmail || "",
      "{{phone}}": candidate.phone || candidate.parsed_json?.phone || "",
    };
    Object.entries(replacements).forEach(([key, val]) => {
      s = s.replaceAll(key, val);
      b = b.replaceAll(key, val);
    });
    setSubject(s);
    setBody(b);
  };

  const sendEmail = async () => {
    if (!candidateEmail || !subject.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: candidate.id,
          jobId,
          templateId: selectedTemplate,
          subject: subject.trim(),
          body: body.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send");
      setSent(true);
      setSubject("");
      setBody("");
      setSelectedTemplate(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-5 space-y-4">
      {!candidateEmail && (
        <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
          No email address available for this candidate
        </div>
      )}

      {/* Template selector + manage button */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Use Template</label>
          <button
            onClick={() => { setShowTemplateManager(!showTemplateManager); if (showTemplateManager) resetTplForm(); }}
            className="text-xs font-medium text-violet-500 hover:text-violet-600 transition cursor-pointer inline-flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showTemplateManager ? "M6 18L18 6M6 6l12 12" : "M12 4v16m8-8H4"} /></svg>
            {showTemplateManager ? "Close" : "Manage Templates"}
          </button>
        </div>
        {templates.length > 0 ? (
          <select
            value={selectedTemplate || ""}
            onChange={(e) => e.target.value ? applyTemplate(e.target.value) : setSelectedTemplate(null)}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 cursor-pointer"
          >
            <option value="">Select a template...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">No templates yet. Click &quot;Manage Templates&quot; to create one.</p>
        )}
      </div>

      {/* Template manager panel */}
      {showTemplateManager && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-950/20 p-4 space-y-3">
          <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{editingTemplate ? "Edit Template" : "New Template"}</h4>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Name</label>
              <input type="text" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Interview Invite" className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Category</label>
              <select value={tplCategory} onChange={(e) => setTplCategory(e.target.value)} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 cursor-pointer">
                <option value="general">General</option>
                <option value="interview">Interview</option>
                <option value="rejection">Rejection</option>
                <option value="follow-up">Follow Up</option>
                <option value="offer">Offer</option>
                <option value="onboarding">Onboarding</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Subject</label>
            <input type="text" value={tplSubject} onChange={(e) => setTplSubject(e.target.value)} placeholder="Email subject line..." className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Body</label>
            <textarea value={tplBody} onChange={(e) => setTplBody(e.target.value)} placeholder="Write template body... Use {{name}}, {{email}}, {{phone}}, {{role}}, {{company}} as merge fields" rows={5} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none" />
          </div>

          {tplError && <p className="text-xs text-red-500">{tplError}</p>}

          <div className="flex gap-2">
            <button onClick={saveTemplate} disabled={tplSaving} className="rounded-lg bg-violet-500 text-white px-4 py-2 text-xs font-bold hover:bg-violet-600 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
              {tplSaving ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</> : editingTemplate ? "Update Template" : "Create Template"}
            </button>
            {editingTemplate && (
              <button onClick={resetTplForm} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition cursor-pointer">Cancel</button>
            )}
          </div>

          {/* Existing templates list */}
          {templates.length > 0 && (
            <div className="border-t border-violet-200 dark:border-violet-800/50 pt-3 mt-3 space-y-2">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Your Templates ({templates.length})</p>
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 group">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{t.name}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{t.subject}</p>
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => startEditTemplate(t)} className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 hover:text-violet-500 transition cursor-pointer" title="Edit">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => deleteTemplate(t.id)} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition cursor-pointer" title="Delete">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compose */}
      <div>
        <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5 block">To</label>
        <input
          type="text"
          value={candidateEmail || "No email"}
          disabled
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-3.5 py-2.5 text-sm text-zinc-500 dark:text-zinc-400"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5 block">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject..."
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5 block">Body</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your email..."
          rows={6}
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
        />
        <p className="text-xs text-zinc-400 mt-1">Merge fields: {"{{name}}"}, {"{{email}}"}, {"{{phone}}"}, {"{{role}}"}, {"{{company}}"}</p>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-xl p-3 border border-red-200 dark:border-red-800">{error}</div>
      )}
      {sent && (
        <div className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">Email sent successfully!</div>
      )}

      <button
        onClick={sendEmail}
        disabled={sending || !candidateEmail || !subject.trim() || !body.trim()}
        className="w-full rounded-xl bg-violet-500 text-white py-3 text-sm font-bold hover:bg-violet-600 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        {sending ? (
          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending...</>
        ) : (
          <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> Send Email</>
        )}
      </button>

      {/* Quick templates if none saved and manager is closed */}
      {templates.length === 0 && !showTemplateManager && (
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">Quick templates:</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "Interview Invite", subj: "Interview Invitation - Next Steps", bod: "Hi {{name}},\n\nThank you for your application. We'd like to invite you for an interview to discuss the role further.\n\nPlease let us know your availability for the coming week.\n\nBest regards" },
              { label: "Rejection", subj: "Application Update", bod: "Hi {{name}},\n\nThank you for your interest and the time you invested in the application process.\n\nAfter careful consideration, we've decided to move forward with other candidates whose experience more closely aligns with our current needs.\n\nWe wish you the best in your job search.\n\nBest regards" },
              { label: "Follow Up", subj: "Following Up on Your Application", bod: "Hi {{name}},\n\nWe wanted to follow up regarding your application. Our team is currently reviewing candidates and we'll be in touch soon with next steps.\n\nThank you for your patience.\n\nBest regards" },
            ].map((t) => (
              <button
                key={t.label}
                onClick={() => {
                  const name = candidate.full_name || "Candidate";
                  setSubject(t.subj);
                  setBody(t.bod.replaceAll("{{name}}", name));
                }}
                className="text-xs rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 px-2.5 py-1.5 text-zinc-500 dark:text-zinc-400 hover:border-violet-400 hover:text-violet-600 transition cursor-pointer"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BulkCallModal({
  resumeIds,
  jobId,
  onClose,
}: {
  resumeIds: string[];
  jobId: string;
  onClose: () => void;
}) {
  const [questions, setQuestions] = useState<string[]>(DEFAULT_SCREENING_QUESTIONS.slice(0, 3));
  const [newQuestion, setNewQuestion] = useState("");
  const [calling, setCalling] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const startBulkCall = async () => {
    if (!questions.length) return;
    setCalling(true);
    setError(null);
    try {
      const res = await fetch("/api/voice-call/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeIds, jobId, questions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setResults(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Bulk Screening Calls</h3>
            <p className="text-sm text-zinc-500 mt-0.5">{resumeIds.length} candidates selected</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer">
            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {results ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 text-center border border-emerald-200 dark:border-emerald-800">
                  <div className="text-2xl font-bold text-emerald-600">{results.queued}</div>
                  <div className="text-xs text-emerald-600 font-medium">Queued</div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 text-center border border-amber-200 dark:border-amber-800">
                  <div className="text-2xl font-bold text-amber-600">{results.skipped}</div>
                  <div className="text-xs text-amber-600 font-medium">Skipped</div>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-3 text-center border border-red-200 dark:border-red-800">
                  <div className="text-2xl font-bold text-red-600">{results.failed}</div>
                  <div className="text-xs text-red-600 font-medium">Failed</div>
                </div>
              </div>
              <div className="space-y-1.5">
                {results.results.map((r: any) => (
                  <div key={r.resumeId} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                    <div className={`w-2 h-2 rounded-full ${r.status === "queued" ? "bg-emerald-500" : r.status === "skipped" ? "bg-amber-500" : "bg-red-500"}`} />
                    <span className="text-zinc-700 dark:text-zinc-300 flex-1">{r.name}</span>
                    <span className="text-xs text-zinc-400">{r.error || r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Questions for all candidates</h4>
                <div className="space-y-2">
                  {questions.map((q, i) => (
                    <div key={i} className="flex items-start gap-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5 border border-zinc-200 dark:border-zinc-700">
                      <span className="text-xs font-bold text-violet-600 dark:text-violet-400 mt-0.5 shrink-0">{i + 1}.</span>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1">{q}</span>
                      <button onClick={() => setQuestions((p) => p.filter((_, j) => j !== i))} className="text-zinc-400 hover:text-red-500 cursor-pointer">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <input type="text" value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newQuestion.trim()) { setQuestions((p) => [...p, newQuestion.trim()]); setNewQuestion(""); } }} placeholder="Add question..." className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
                <button onClick={() => { if (newQuestion.trim()) { setQuestions((p) => [...p, newQuestion.trim()]); setNewQuestion(""); } }} className="rounded-lg bg-violet-500 text-white px-3 py-2 text-sm font-semibold hover:bg-violet-600 cursor-pointer">Add</button>
              </div>
            </>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 border border-red-200 dark:border-red-800">{error}</div>}
        </div>

        <div className="p-5 border-t border-zinc-100 dark:border-zinc-800 flex gap-2 justify-end">
          <button onClick={onClose} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-4 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 cursor-pointer">
            {results ? "Close" : "Cancel"}
          </button>
          {!results && (
            <button onClick={startBulkCall} disabled={calling || questions.length === 0} className="rounded-xl bg-emerald-500 text-white px-4 py-2 text-sm font-bold hover:bg-emerald-600 cursor-pointer disabled:opacity-40 inline-flex items-center gap-2">
              {calling ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Calling...</> : <>Start {resumeIds.length} Calls</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type InterviewSchedule = {
  id: string;
  token: string;
  candidate_name: string | null;
  candidate_email: string;
  available_slots: string[];
  selected_slot: string | null;
  status: string;
  interview_type: string;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  created_at: string;
};

function ScheduleTab({ candidate, jobId }: { candidate: ResumeRow; jobId: string }) {
  const [schedules, setSchedules] = useState<InterviewSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Slot picker state
  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const [slotDate, setSlotDate] = useState("");
  const [slotTime, setSlotTime] = useState("10:00");
  const [customSlots, setCustomSlots] = useState<string[]>([]);
  const [interviewType, setInterviewType] = useState("video");
  const [duration, setDuration] = useState(30);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetchSchedules();
  }, [candidate.id]);

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/schedule?resumeId=${candidate.id}`);
      const json = await res.json();
      if (res.ok) setSchedules(json.data || []);
    } catch {} finally {
      setLoading(false);
    }
  };

  const addSlot = () => {
    if (!slotDate || !slotTime) return;
    const iso = new Date(`${slotDate}T${slotTime}:00`).toISOString();
    if (!customSlots.includes(iso)) {
      setCustomSlots((prev) => [...prev, iso].sort());
    }
    setSlotTime("10:00");
  };

  const removeSlot = (iso: string) => {
    setCustomSlots((prev) => prev.filter((s) => s !== iso));
  };

  const addQuickSlots = () => {
    // Add default: next 5 business days at 10am and 2pm
    const slots: string[] = [];
    const now = new Date();
    let day = new Date(now);
    day.setDate(day.getDate() + 1);
    let added = 0;
    while (added < 5) {
      const dow = day.getDay();
      if (dow !== 0 && dow !== 6) {
        const morning = new Date(day);
        morning.setHours(10, 0, 0, 0);
        slots.push(morning.toISOString());
        const afternoon = new Date(day);
        afternoon.setHours(14, 0, 0, 0);
        slots.push(afternoon.toISOString());
        added++;
      }
      day.setDate(day.getDate() + 1);
    }
    setCustomSlots((prev) => {
      const combined = new Set([...prev, ...slots]);
      return Array.from(combined).sort();
    });
  };

  const sendInvite = async () => {
    if (customSlots.length === 0) {
      setError("Add at least one time slot");
      return;
    }
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: candidate.id,
          jobId,
          availableSlots: customSlots,
          interviewType,
          durationMinutes: duration,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send invite");
      setSuccess("Scheduling invite sent!");
      setShowSlotPicker(false);
      setCustomSlots([]);
      setLocation("");
      setNotes("");
      fetchSchedules();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const cancelSchedule = async (id: string) => {
    try {
      // We don't have a delete endpoint, but we can update via the main schedule endpoint
      // For now, just refetch — cancellation can be done from Supabase
      setError("Contact support to cancel this interview");
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  const candidateEmail = candidate.email || candidate.parsed_json?.email;

  return (
    <div className="p-5 space-y-5">
      {/* Active schedules */}
      {schedules.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Interview Schedules</h4>
          {schedules.map((s) => {
            const isBooked = s.status === "booked";
            const isCancelled = s.status === "cancelled";
            return (
              <div
                key={s.id}
                className={`rounded-xl border p-4 ${
                  isBooked
                    ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                    : isCancelled
                    ? "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 opacity-60"
                    : "bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                      isBooked
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : isCancelled
                        ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
                        : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400"
                    }`}
                  >
                    {isBooked ? "Booked" : isCancelled ? "Cancelled" : "Pending"}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {s.interview_type} · {s.duration_minutes}min
                  </span>
                </div>

                {isBooked && s.selected_slot && (
                  <div className="mb-2">
                    <div className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                      {new Date(s.selected_slot).toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                    <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                      {new Date(s.selected_slot).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </div>
                  </div>
                )}

                {!isBooked && !isCancelled && (
                  <div className="mb-2">
                    <div className="text-xs text-violet-600 dark:text-violet-400 mb-1">
                      {s.available_slots.length} time slots offered · Waiting for candidate
                    </div>
                  </div>
                )}

                {s.location && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mb-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    {s.location}
                  </div>
                )}

                <div className="text-xs text-zinc-400 mt-2">
                  Sent {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No candidate email warning */}
      {!candidateEmail && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
          <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-xs text-amber-700 dark:text-amber-400">No email address for this candidate. A scheduling invite cannot be sent.</p>
        </div>
      )}

      {/* Send new invite */}
      {!showSlotPicker && candidateEmail && (
        <button
          onClick={() => {
            setShowSlotPicker(true);
            if (customSlots.length === 0) addQuickSlots();
          }}
          className="w-full rounded-xl border border-dashed border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/20 px-4 py-3 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-950/40 transition cursor-pointer inline-flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Send Interview Scheduling Invite
        </button>
      )}

      {/* Slot picker form */}
      {showSlotPicker && (
        <div className="space-y-4 border border-violet-200 dark:border-violet-800 rounded-xl p-4 bg-white dark:bg-zinc-900/50">
          <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Configure Interview</h4>

          {/* Interview type + duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Format</label>
              <select
                value={interviewType}
                onChange={(e) => setInterviewType(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              >
                <option value="video">Video</option>
                <option value="phone">Phone</option>
                <option value="in-person">In-Person</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
              </select>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Location / Link (optional)</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Zoom link, office address, phone number..."
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>

          {/* Prep notes */}
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Prep Notes for Candidate (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Please have your portfolio ready, bring ID, etc."
              rows={2}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
            />
          </div>

          {/* Time slots */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Time Slots</label>
              <button
                onClick={addQuickSlots}
                className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 font-semibold cursor-pointer"
              >
                + Auto-fill 5 days
              </button>
            </div>

            {/* Existing slots */}
            {customSlots.length > 0 && (
              <div className="space-y-1.5 mb-3 max-h-48 overflow-y-auto">
                {customSlots.map((slot) => {
                  const d = new Date(slot);
                  return (
                    <div
                      key={slot}
                      className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2 border border-zinc-200 dark:border-zinc-700 group"
                    >
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">
                        {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at{" "}
                        {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                      </span>
                      <button
                        onClick={() => removeSlot(slot)}
                        className="text-zinc-300 dark:text-zinc-600 group-hover:text-red-500 transition cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add slot */}
            <div className="flex gap-2">
              <input
                type="date"
                value={slotDate}
                onChange={(e) => setSlotDate(e.target.value)}
                min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
              <input
                type="time"
                value={slotTime}
                onChange={(e) => setSlotTime(e.target.value)}
                className="w-28 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
              <button
                onClick={addSlot}
                disabled={!slotDate}
                className="rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
              {success}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowSlotPicker(false);
                setError(null);
                setSuccess(null);
              }}
              className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={sendInvite}
              disabled={sending || customSlots.length === 0}
              className="flex-1 rounded-xl bg-violet-600 text-white py-2.5 text-sm font-bold hover:bg-violet-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Send Invite ({customSlots.length} slots)
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {schedules.length === 0 && !showSlotPicker && candidateEmail && (
        <div className="text-center py-6">
          <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No interviews scheduled</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            Scheduling invites are sent automatically after screening calls, or you can send one manually above.
          </p>
        </div>
      )}
    </div>
  );
}

function CompareModal({
  resumeIds,
  onClose,
}: {
  resumeIds: string[];
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeIds }),
        });
        const json = await res.json();
        if (res.ok) setData(json.data);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Compare Candidates</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer">
            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" /></div>
        ) : !data ? (
          <div className="p-8 text-center text-zinc-400">Failed to load comparison data</div>
        ) : (
          <div className="p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="text-left py-3 px-3 text-xs font-bold text-zinc-500 uppercase tracking-wide w-32">Attribute</th>
                  {data.candidates.map((c: any) => (
                    <th key={c.id} className="text-left py-3 px-3 text-sm font-bold text-zinc-800 dark:text-zinc-200">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {[
                  { label: "Score", render: (c: any) => <span className={`font-bold ${c.score >= 70 ? "text-emerald-600" : c.score >= 40 ? "text-amber-600" : "text-red-600"}`}>{c.score ?? "N/A"}%</span> },
                  { label: "Experience", render: (c: any) => `${c.yearsExperience} years` },
                  { label: "Location", render: (c: any) => c.location || "N/A" },
                  { label: "Visa Status", render: (c: any) => c.visaStatus || "N/A" },
                  { label: "Work Auth", render: (c: any) => c.workAuthorization || "N/A" },
                  { label: "Email", render: (c: any) => c.email || "N/A" },
                  { label: "Phone", render: (c: any) => c.phone || "N/A" },
                  { label: "Skills", render: (c: any) => (
                    <div className="flex flex-wrap gap-1">
                      {(c.skills || []).slice(0, 8).map((s: string) => (
                        <span key={s} className={`text-xs px-1.5 py-0.5 rounded ${data.commonSkills.includes(s.toLowerCase()) ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : (data.uniqueSkills[c.id] || []).includes(s) ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"}`}>{s}</span>
                      ))}
                      {(c.skills || []).length > 8 && <span className="text-xs text-zinc-400">+{c.skills.length - 8}</span>}
                    </div>
                  )},
                  { label: "Education", render: (c: any) => (c.education || []).map((e: any) => `${e.degree || ""} - ${e.school || ""}`).join(", ") || "N/A" },
                  { label: "Certifications", render: (c: any) => c.certifications || 0 },
                  { label: "Projects", render: (c: any) => c.projects || 0 },
                  { label: "Calls Made", render: (c: any) => c.callCount || 0 },
                  { label: "Strengths", render: (c: any) => (
                    <ul className="list-disc list-inside text-xs text-emerald-600 dark:text-emerald-400">
                      {(c.strengths || []).slice(0, 4).map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>
                  )},
                  { label: "Weaknesses", render: (c: any) => (
                    <ul className="list-disc list-inside text-xs text-red-500 dark:text-red-400">
                      {(c.weaknesses || []).slice(0, 4).map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>
                  )},
                ].map((row) => (
                  <tr key={row.label}>
                    <td className="py-2.5 px-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{row.label}</td>
                    {data.candidates.map((c: any) => (
                      <td key={c.id} className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300">{row.render(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Skill legend */}
            <div className="mt-4 flex items-center gap-4 text-xs text-zinc-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/30" /> Common skill</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-violet-100 dark:bg-violet-900/30" /> Unique skill</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// AI COPILOT CHAT PANEL
// ============================================
function CopilotPanel({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg, jobId }),
      });
      const json = await res.json();
      const reply = res.ok ? json.response : json.error || "Something went wrong";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to get response" }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-[100] w-full max-w-lg flex flex-col bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl animate-[slideIn_0.2s_ease-out]">
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span className="text-violet-600">AI</span> Recruiting Copilot
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">Claude</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">Ask anything about your candidates</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer">
            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">🤖</div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Ask me about your candidates</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {["Who are the top 3 candidates?", "Which candidates have Python experience?", "Summarize the skill gaps", "Who should we interview first?"].map((q) => (
                  <button key={q} onClick={() => { setInput(q); }} className="text-xs px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-700 dark:hover:text-violet-300 hover:border-violet-200 dark:hover:border-violet-800 transition cursor-pointer">{q}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 p-4">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Ask about your candidates..."
              className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition cursor-pointer"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </>
  );
}

// ============================================
// SEMANTIC SEARCH MODAL
// ============================================
function SemanticSearchModal({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [embedResult, setEmbedResult] = useState<any>(null);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch("/api/semantic-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, jobId }),
      });
      const json = await res.json();
      setResults(res.ok ? json.data?.results || [] : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const embedAll = async () => {
    setEmbedding(true);
    setEmbedResult(null);
    try {
      const res = await fetch("/api/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const json = await res.json();
      setEmbedResult(res.ok ? json.data : { error: json.error });
    } catch {
      setEmbedResult({ error: "Failed to generate embeddings" });
    } finally {
      setEmbedding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Semantic Search
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">RAG</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">Find candidates using natural language powered by vector embeddings</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer">
            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Embed button */}
          <div className="flex items-center gap-3">
            <button
              onClick={embedAll}
              disabled={embedding}
              className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 px-4 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition cursor-pointer disabled:opacity-50"
            >
              {embedding ? "Generating Embeddings..." : "Generate Embeddings for All Candidates"}
            </button>
            {embedResult && (
              <span className="text-xs text-zinc-500">
                {embedResult.error || `${embedResult.embedded}/${embedResult.total} embedded`}
              </span>
            )}
          </div>

          {/* Search input */}
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="e.g. &quot;Senior React developer with AWS experience in fintech&quot;"
              className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            <button
              onClick={search}
              disabled={!query.trim() || loading}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition cursor-pointer"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>

          {/* Results */}
          {searched && !loading && results.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-8">No matching candidates found. Try generating embeddings first.</p>
          )}
          {results.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">{results.length} results found</p>
              {results.map((r: any) => (
                <div key={r.resumeId} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{r.name}</span>
                      {r.email && <span className="text-xs text-zinc-400 ml-2">{r.email}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-blue-600 dark:text-blue-400">{(r.similarity * 100).toFixed(0)}% match</span>
                      {r.score != null && (
                        <span className={`text-xs font-bold ${r.score >= 70 ? "text-emerald-600" : r.score >= 40 ? "text-amber-600" : "text-red-600"}`}>Score: {r.score}</span>
                      )}
                    </div>
                  </div>
                  {r.summary && <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{r.summary}</p>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(r.skills || []).slice(0, 6).map((s: string) => (
                      <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">{s}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// SCORING RUBRIC MODAL
// ============================================
function ScoringRubricModal({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [criteria, setCriteria] = useState<{ name: string; weight: number; description: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/scoring-rubric?jobId=${jobId}`);
        const json = await res.json();
        if (json.data?.criteria?.length) {
          setCriteria(json.data.criteria);
        } else {
          setCriteria([
            { name: "Technical Skills", weight: 30, description: "Relevant programming languages, frameworks, and tools" },
            { name: "Experience", weight: 25, description: "Years and relevance of work experience" },
            { name: "Education", weight: 15, description: "Degree relevance and institution quality" },
            { name: "Culture Fit", weight: 15, description: "Communication style, team collaboration" },
            { name: "Domain Knowledge", weight: 15, description: "Industry-specific knowledge and certifications" },
          ]);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, [jobId]);

  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);

  const save = async () => {
    if (totalWeight !== 100) { setMsg(`Weights must sum to 100 (currently ${totalWeight})`); return; }
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/scoring-rubric", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, criteria }),
      });
      const json = await res.json();
      setMsg(res.ok ? "Rubric saved successfully!" : json.error || "Failed to save");
    } catch { setMsg("Error saving rubric"); } finally { setSaving(false); }
  };

  const addCriterion = () => setCriteria([...criteria, { name: "", weight: 0, description: "" }]);
  const removeCriterion = (i: number) => setCriteria(criteria.filter((_, idx) => idx !== i));
  const updateCriterion = (i: number, field: string, value: any) => {
    const updated = [...criteria];
    (updated[i] as any)[field] = field === "weight" ? Number(value) || 0 : value;
    setCriteria(updated);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Scoring Rubric</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Define custom weighted criteria for AI scoring</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer">
            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" /></div>
        ) : (
          <div className="p-5 overflow-y-auto flex-1 space-y-4">
            <div className="space-y-3">
              {criteria.map((c, i) => (
                <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={c.name}
                      onChange={(e) => updateCriterion(i, "name", e.target.value)}
                      placeholder="Criterion name"
                      className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none text-zinc-800 dark:text-zinc-200"
                    />
                    <input
                      type="number"
                      value={c.weight}
                      onChange={(e) => updateCriterion(i, "weight", e.target.value)}
                      min={0}
                      max={100}
                      className="w-20 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-center outline-none text-zinc-800 dark:text-zinc-200"
                    />
                    <span className="self-center text-xs text-zinc-400">%</span>
                    <button onClick={() => removeCriterion(i)} className="text-red-400 hover:text-red-600 p-1 cursor-pointer">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                  <input
                    value={c.description}
                    onChange={(e) => updateCriterion(i, "description", e.target.value)}
                    placeholder="Description (what to evaluate)"
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs outline-none text-zinc-600 dark:text-zinc-400"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button onClick={addCriterion} className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline cursor-pointer">+ Add Criterion</button>
              <span className={`text-xs font-bold ${totalWeight === 100 ? "text-emerald-600" : "text-red-500"}`}>
                Total: {totalWeight}% {totalWeight === 100 ? "✓" : `(need ${100 - totalWeight}% more)`}
              </span>
            </div>

            {msg && (
              <p className={`text-xs ${msg.includes("success") ? "text-emerald-600" : "text-red-500"}`}>{msg}</p>
            )}

            <button
              onClick={save}
              disabled={saving || totalWeight !== 100}
              className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition cursor-pointer"
            >
              {saving ? "Saving..." : "Save Rubric"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// AI ANALYTICS / GOVERNANCE MODAL
// ============================================
function AIAnalyticsModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const load = async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai-analytics?days=${d}`);
      const json = await res.json();
      if (res.ok) setData(json.data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(days); }, [days]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">AI Governance & Monitoring</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Track AI performance, costs, and reliability across all features</p>
          </div>
          <div className="flex items-center gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${days === d ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
              >{d}d</button>
            ))}
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer ml-2">
              <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" /></div>
        ) : !data ? (
          <div className="p-8 text-center text-zinc-400">No AI analytics data yet</div>
        ) : (
          <div className="p-5 overflow-y-auto flex-1 space-y-6">
            {/* Overview cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total AI Calls", value: data.overview.totalCalls, color: "blue" },
                { label: "Success Rate", value: `${data.overview.successRate}%`, color: "emerald" },
                { label: "Avg Latency", value: `${data.overview.avgLatency}ms`, color: "amber" },
                { label: "P95 Latency", value: `${data.overview.p95Latency}ms`, color: "red" },
              ].map((m) => (
                <div key={m.label} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 text-center">
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{m.value}</div>
                  <div className="text-xs text-zinc-500 mt-1">{m.label}</div>
                </div>
              ))}
            </div>

            {/* By Provider */}
            <div>
              <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-2">By Provider</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.entries(data.byProvider).map(([provider, stats]: [string, any]) => (
                  <div key={provider} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 capitalize">{provider}</span>
                      <span className="text-xs text-zinc-400">{stats.calls} calls</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span className="text-emerald-600">{stats.success} ok</span>
                      <span className="text-red-500">{stats.calls - stats.success} errors</span>
                      <span>{stats.avgLatency}ms avg</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By Feature */}
            <div>
              <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-2">By Feature</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="text-left py-2 text-xs font-bold text-zinc-500 uppercase">Feature</th>
                    <th className="text-right py-2 text-xs font-bold text-zinc-500 uppercase">Calls</th>
                    <th className="text-right py-2 text-xs font-bold text-zinc-500 uppercase">Success</th>
                    <th className="text-right py-2 text-xs font-bold text-zinc-500 uppercase">Avg Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {Object.entries(data.byFeature).map(([feature, stats]: [string, any]) => (
                    <tr key={feature}>
                      <td className="py-2 text-zinc-700 dark:text-zinc-300 font-medium">{feature}</td>
                      <td className="py-2 text-right text-zinc-500">{stats.calls}</td>
                      <td className="py-2 text-right text-emerald-600">{stats.success}</td>
                      <td className="py-2 text-right text-zinc-500">{stats.avgLatency}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recent Errors */}
            {data.recentErrors?.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-2">Recent Errors</h4>
                <div className="space-y-2">
                  {data.recentErrors.slice(0, 5).map((e: any, i: number) => (
                    <div key={i} className="rounded-lg border border-red-200 dark:border-red-800/30 bg-red-50/50 dark:bg-red-950/10 p-3 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-red-700 dark:text-red-400">{e.feature} ({e.provider})</span>
                        <span className="text-zinc-400">{new Date(e.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-red-600 dark:text-red-400">{e.error}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// WORKFLOW RESULT MODAL
// ============================================
function WorkflowResultModal({ data, onClose }: { data: any; onClose: () => void }) {
  const TOOL_META: Record<string, { label: string; icon: string }> = {
    parse_resume: { label: "Parse Resume", icon: "1" },
    score_candidate: { label: "Score Candidate", icon: "2" },
    generate_screening_questions: { label: "Generate Questions", icon: "3" },
    generate_embedding: { label: "Embed for Search", icon: "4" },
    decide_pipeline_stage: { label: "Pipeline Decision", icon: "5" },
    draft_email: { label: "Draft Email", icon: "6" },
  };

  const successCount = Object.values(data.results).filter((r: any) => r.success).length;
  const failCount = Object.values(data.results).length - successCount;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100">
              <svg className="h-4 w-4 text-white dark:text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI Workflow Complete</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-zinc-400">{(data.totalDurationMs / 1000).toFixed(1)}s total</span>
                <span className="text-zinc-200 dark:text-zinc-700">·</span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">{successCount} passed</span>
                {failCount > 0 && (
                  <>
                    <span className="text-zinc-200 dark:text-zinc-700">·</span>
                    <span className="text-xs text-red-500">{failCount} failed</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer">
            <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Results */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {Object.entries(data.results).map(([resumeId, result]: [string, any], idx: number) => {
            // Try to get candidate name from the parse step output
            const parsedName = result.steps?.find((s: any) => s.tool === "parse_resume" && s.status === "success")?.output?.full_name;
            const pipelineStep = result.steps?.find((s: any) => s.tool === "decide_pipeline_stage" && s.status === "success");
            const scoreStep = result.steps?.find((s: any) => s.tool === "score_candidate" && s.status === "success");
            const emailStep = result.steps?.find((s: any) => s.tool === "draft_email" && s.status === "success");

            return (
              <div key={resumeId} className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                {/* Candidate Header */}
                <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${
                      result.success
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                        : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                    }`}>
                      {result.success ? (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {parsedName || `Candidate ${idx + 1}`}
                      </span>
                      {!result.success && (
                        <span className="ml-2 text-xs text-red-500">{result.error}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {scoreStep?.output?.score != null && (
                      <span className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Score: {scoreStep.output.score}
                      </span>
                    )}
                    {pipelineStep?.output?.stage && (
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
                        pipelineStep.output.stage === "interview" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" :
                        pipelineStep.output.stage === "screening" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" :
                        pipelineStep.output.stage === "rejected" ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" :
                        "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                      }`}>
                        {pipelineStep.output.stage}
                      </span>
                    )}
                    {result.success && (
                      <span className="text-[10px] text-zinc-400">{(result.durationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                </div>

                {/* Steps Timeline */}
                {result.success && result.steps?.length > 0 && (
                  <div className="px-4 py-3 space-y-0">
                    {result.steps.map((step: any, i: number) => {
                      const meta = TOOL_META[step.tool] || { label: step.tool.replace(/_/g, " "), icon: String(i + 1) };
                      const isLast = i === result.steps.length - 1;

                      return (
                        <div key={i} className="flex gap-3">
                          {/* Timeline connector */}
                          <div className="flex flex-col items-center">
                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                              step.status === "success"
                                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                                : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                            }`}>
                              {meta.icon}
                            </div>
                            {!isLast && (
                              <div className="w-px h-full min-h-[16px] bg-zinc-200 dark:bg-zinc-800" />
                            )}
                          </div>

                          {/* Step Content */}
                          <div className={`flex-1 ${isLast ? "pb-0" : "pb-3"}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{meta.label}</span>
                              <span className="text-[10px] text-zinc-400">{step.durationMs}ms</span>
                            </div>

                            {/* Pipeline decision detail */}
                            {step.tool === "decide_pipeline_stage" && step.status === "success" && step.output?.reasoning && (
                              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{step.output.reasoning}</p>
                            )}

                            {/* Email draft detail */}
                            {step.tool === "draft_email" && step.status === "success" && step.output?.subject && (
                              <div className="mt-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-2.5">
                                <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">{step.output.subject}</div>
                                <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-3 whitespace-pre-wrap">{step.output.body}</div>
                                <div className="mt-1.5 text-[10px] text-zinc-400">Saved as email template</div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Summary */}
                {result.success && result.summary && (
                  <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {result.summary}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
