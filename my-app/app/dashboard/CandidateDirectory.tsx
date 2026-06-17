"use client";

import React, { useState, useEffect, Fragment, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type CandidateRow = {
  id: string;
  original_filename: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  score: number | null;
  status: string;
  created_at: string;
  parsed_json?: any;
};

export default function CandidateDirectory() {
  const supabase = createSupabaseBrowserClient();

  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [err, setErr] = useState<string | null>(null);

  // Selection state
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [deleteMultipleOpen, setDeleteMultipleOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [minExpFilter, setMinExpFilter] = useState("");
  const [visaFilter, setVisaFilter] = useState("");
  const [workAuthFilter, setWorkAuthFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // UI state
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<CandidateRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  // Selection handlers
  const handleSelectCandidate = (id: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllOnPage = () => {
    const visibleIds = filteredCandidates.map((c) => c.id);
    const allSelectedOnPage = visibleIds.length > 0 && visibleIds.every((id) => selectedCandidateIds.has(id));

    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (allSelectedOnPage) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Google APIs States
  const [gapiLoaded, setGapiLoaded] = useState(false);
  const [gisLoaded, setGisLoaded] = useState(false);
  const [googleAuthToken, setGoogleAuthToken] = useState<string | null>(null);
  const [driveImporting, setDriveImporting] = useState(false);

  // Google Drive Bulk Import Queue & Progress UI State
  const [importState, setImportState] = useState<{
    status: 'idle' | 'scanning' | 'importing' | 'completed';
    total: number;
    current: number;
    currentFileName: string;
    successCount: number;
    failCount: number;
    errors: Array<{ name: string; error: string }>;
  }>({
    status: 'idle',
    total: 0,
    current: 0,
    currentFileName: '',
    successCount: 0,
    failCount: 0,
    errors: [],
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch candidates from API
  async function fetchCandidates(pageNumber = 1) {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pageNumber));
      if (locationFilter.trim()) params.set("candidate_location", locationFilter.trim());
      if (minExpFilter.trim()) params.set("years_experience", minExpFilter.trim());
      if (visaFilter.trim()) params.set("visa_status", visaFilter.trim());
      if (workAuthFilter.trim()) params.set("work_authorization", workAuthFilter.trim());
      if (statusFilter.trim()) params.set("status", statusFilter.trim());

      const res = await fetch(`/api/resumes?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to fetch candidates");

      setCandidates(json.data ?? []);
      setTotalCount(json.totalCount ?? 0);
      setTotalPages(json.totalPages ?? 1);
      setPage(json.page ?? 1);
      setSelectedCandidateIds(new Set()); // Reset selection on page reload

      // Identify candidates currently processing and poll their status
      const processing = (json.data ?? [])
        .filter((r: CandidateRow) => r.status === "uploaded" || r.status === "processing")
        .map((r: CandidateRow) => r.id);

      if (processing.length > 0) {
        setPollingIds(new Set(processing));
      }
    } catch (e: any) {
      setErr(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Bulk deletion handler
  async function handleBulkDelete() {
    setDeleting(true);
    try {
      const promises = Array.from(selectedCandidateIds).map((id) =>
        fetch(`/api/resumes/${id}`, { method: "DELETE" })
      );
      await Promise.all(promises);
      setSelectedCandidateIds(new Set());
      setDeleteMultipleOpen(false);
      await fetchCandidates(page);
    } catch (e: any) {
      setErr(e.message ?? "Bulk delete failed");
    } finally {
      setDeleting(false);
    }
  }

  // Load Google APIs
  useEffect(() => {
    // 1. Load GAPI (Google API client)
    const gapiScript = document.createElement("script");
    gapiScript.src = "https://apis.google.com/js/api.js";
    gapiScript.async = true;
    gapiScript.defer = true;
    gapiScript.onload = () => {
      if ((window as any).gapi) {
        setGapiLoaded(true);
      } else {
        console.error("gapi load failed");
      }
    };
    document.body.appendChild(gapiScript);

    // 2. Load GIS (Google Identity Services)
    const gisScript = document.createElement("script");
    gisScript.src = "https://accounts.google.com/gsi/client";
    gisScript.async = true;
    gisScript.defer = true;
    gisScript.onload = () => {
      if ((window as any).google) {
        setGisLoaded(true);
      } else {
        console.error("gis load failed");
      }
    };
    document.body.appendChild(gisScript);

    return () => {
      document.body.removeChild(gapiScript);
      document.body.removeChild(gisScript);
    };
  }, []);

  // Poll processing candidates
  useEffect(() => {
    if (pollingIds.size === 0) return;

    const interval = setInterval(async () => {
      let activePolls = new Set(pollingIds);
      const updatedCandidates = [...candidates];
      let changesDetected = false;

      for (const id of Array.from(pollingIds)) {
        try {
          const res = await fetch(`/api/resumes/${id}`);
          if (!res.ok) continue;
          const json = await res.json();
          const resume = json.data;

          if (resume && resume.status !== "uploaded" && resume.status !== "processing") {
            // Processing finished
            activePolls.delete(id);
            const index = updatedCandidates.findIndex((c) => c.id === id);
            if (index !== -1) {
              updatedCandidates[index] = resume;
              changesDetected = true;
            }
          }
        } catch (err) {
          console.error("Polling error for candidate", id, err);
        }
      }

      if (changesDetected) {
        setCandidates(updatedCandidates);
      }
      setPollingIds(activePolls);
    }, 4000);

    return () => clearInterval(interval);
  }, [pollingIds, candidates]);

  // Initial load & filter apply
  useEffect(() => {
    fetchCandidates(1);
  }, [locationFilter, minExpFilter, visaFilter, workAuthFilter, statusFilter]);

  const handleClearFilters = () => {
    setLocationFilter("");
    setMinExpFilter("");
    setVisaFilter("");
    setWorkAuthFilter("");
    setStatusFilter("");
    setSearchQuery("");
    setPage(1);
  };

  // Upload handler
  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;

    setUploading(true);
    setErr(null);
    const errors: string[] = [];
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);

        const res = await fetch("/api/resumes/upload", {
          method: "POST",
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) errors.push(`${file.name}: ${json?.error ?? "Upload failed"}`);
      }

      if (errors.length > 0) {
        setErr(`Failed to upload ${errors.length} file(s):\n${errors.join("\n")}`);
      }

      setFiles([]);
      setUploadOpen(false);
      await fetchCandidates(1);
    } catch (e: any) {
      setErr(e.message ?? "Upload error");
    } finally {
      setUploading(false);
    }
  }

  // Trigger Google Sign-In and retrieve a fresh OAuth Access Token
  function getGoogleAuthTokenAndOpenPicker(mode: 'files' | 'folder') {
    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || !process.env.NEXT_PUBLIC_GOOGLE_API_KEY) {
      setErr("Google Integration keys are not configured. Please add NEXT_PUBLIC_GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_API_KEY to your .env.local.");
      return;
    }

    setDriveImporting(true);
    setErr(null);

    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        scope: "https://www.googleapis.com/auth/drive.readonly",
        callback: async (response: any) => {
          if (response.error !== undefined) {
            console.error("GIS Error:", response);
            setErr(`Google Auth failed: ${response.error}`);
            setDriveImporting(false);
            return;
          }
          if (response.access_token) {
            setGoogleAuthToken(response.access_token);
            createPicker(response.access_token, mode);
          } else {
            setDriveImporting(false);
          }
        },
      });

      client.requestAccessToken();
    } catch (e: any) {
      console.error("Init token client failed", e);
      setErr(`Google Picker failed to open: ${e?.message ?? String(e)}`);
      setDriveImporting(false);
    }
  }

  // Create and open the Google Picker dialog
  function createPicker(accessToken: string, mode: 'files' | 'folder') {
    (window as any).gapi.load("picker", {
      callback: () => {
        try {
          const pickerBuilder = new (window as any).google.picker.PickerBuilder()
            .setOAuthToken(accessToken)
            .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY)
            .setCallback((data: any) => pickerCallback(data, accessToken, mode));

          if (mode === 'files') {
            const view = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.DOCS);
            view.setMimeTypes("application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain");
            pickerBuilder
              .addView(view)
              .enableFeature((window as any).google.picker.Feature.MULTISELECT_ENABLED)
              .setTitle("Select Candidate Resumes");
          } else {
            const view = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.FOLDERS);
            view.setMimeTypes("application/vnd.google-apps.folder");
            view.setSelectFolderEnabled(true);
            pickerBuilder
              .addView(view)
              .setTitle("Select Google Drive Folder");
          }

          const picker = pickerBuilder.build();
          picker.setVisible(true);
        } catch (e: any) {
          console.error("Picker build failed", e);
          setErr(`Google Picker error: ${e?.message ?? String(e)}`);
          setDriveImporting(false);
        }
      }
    });
  }

  // Recursively fetch all files within selected Google Drive folder
  async function fetchAllFilesInFolder(folderId: string, folderName: string, accessToken: string): Promise<any[]> {
    setImportState({
      status: 'scanning',
      total: 0,
      current: 0,
      currentFileName: `Scanning folder "${folderName}"...`,
      successCount: 0,
      failCount: 0,
      errors: [],
    });

    const allFiles: any[] = [];
    const foldersToScan = [{ id: folderId, name: folderName }];

    while (foldersToScan.length > 0) {
      const currentFolder = foldersToScan.shift()!;
      setImportState(prev => ({
        ...prev,
        currentFileName: `Scanning folder "${currentFolder.name}"...`,
      }));

      let pageToken: string | undefined = undefined;
      do {
        const query: string = encodeURIComponent(`'${currentFolder.id}' in parents and trashed = false`);
        const url: string = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=nextPageToken,files(id,name,mimeType)${pageToken ? `&pageToken=${pageToken}` : ''}`;
        
        const response: Response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Failed to list files in folder "${currentFolder.name}": ${errText}`);
        }

        const data = await response.json();
        const files = data.files ?? [];

        for (const file of files) {
          if (file.mimeType === "application/vnd.google-apps.folder") {
            foldersToScan.push({ id: file.id, name: file.name });
          } else {
            const lowerName = file.name.toLowerCase();
            const isSupported = 
              file.mimeType === "application/pdf" || 
              file.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
              file.mimeType === "text/plain" ||
              /\.(pdf|docx|txt)$/i.test(lowerName);

            if (isSupported) {
              allFiles.push(file);
            }
          }
        }
        pageToken = data.nextPageToken;
      } while (pageToken);
    }

    return allFiles;
  }

  // Handle sequentially uploading multiple files with staggering index
  async function startFilesImport(docs: any[], accessToken: string) {
    setImportState({
      status: 'importing',
      total: docs.length,
      current: 0,
      currentFileName: '',
      successCount: 0,
      failCount: 0,
      errors: [],
    });

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      setImportState(prev => ({
        ...prev,
        current: i + 1,
        currentFileName: doc.name,
      }));

      try {
        const res = await fetch("/api/resumes/upload/google-drive", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileId: doc.id,
            accessToken,
            fileName: doc.name,
            mimeType: doc.mimeType,
            jobId: null, // Candidate Directory uploads - no job scope
            staggerIndex: i, 
          }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Upload failed");

        setImportState(prev => ({
          ...prev,
          successCount: prev.successCount + 1,
        }));
        
        fetchCandidates(1).catch(console.error);
      } catch (err: any) {
        console.error("File import failed:", doc.name, err);
        setImportState(prev => ({
          ...prev,
          failCount: prev.failCount + 1,
          errors: [...prev.errors, { name: doc.name, error: err.message ?? "Unknown error" }],
        }));
      }

      await new Promise(resolve => setTimeout(resolve, 550));
    }

    setImportState(prev => ({
      ...prev,
      status: 'completed',
    }));

    fetchCandidates(1).catch(console.error);
  }

  // Handle recursively importing files inside folder
  async function startFolderImport(folderId: string, folderName: string, accessToken: string) {
    try {
      const files = await fetchAllFilesInFolder(folderId, folderName, accessToken);
      if (files.length === 0) {
        setImportState({
          status: 'completed',
          total: 0,
          current: 0,
          currentFileName: 'No supported files (PDF, DOCX, TXT) found in this folder.',
          successCount: 0,
          failCount: 0,
          errors: [],
        });
        return;
      }
      await startFilesImport(files, accessToken);
    } catch (err: any) {
      console.error("Folder scan failed:", err);
      setImportState({
        status: 'completed',
        total: 0,
        current: 0,
        currentFileName: '',
        successCount: 0,
        failCount: 0,
        errors: [{ name: folderName, error: err.message ?? "Failed to list folder contents" }],
      });
    }
  }

  // Handle selection from Google Picker
  async function pickerCallback(data: any, accessToken: string, mode: 'files' | 'folder') {
    if (data.action === (window as any).google.picker.Action.PICKED) {
      const docs = data.docs;
      if (!docs || docs.length === 0) {
        setDriveImporting(false);
        return;
      }

      setUploadOpen(false); // Close upload modal to see progress card

      if (mode === 'folder') {
        const folder = docs[0];
        await startFolderImport(folder.id, folder.name, accessToken);
      } else {
        await startFilesImport(docs, accessToken);
      }
      setDriveImporting(false);
    } else if (data.action === (window as any).google.picker.Action.CANCEL) {
      setDriveImporting(false);
    }
  }

  // Delete handler
  async function handleDelete() {
    if (!deleteCandidate) return;
    setDeleting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/resumes/${deleteCandidate.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Delete failed");

      setDeleteOpen(false);
      setDeleteCandidate(null);
      await fetchCandidates(page);
    } catch (e: any) {
      setErr(e.message ?? "Delete failed");
    } finally {
      setDeleting(false);
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

      setCandidates((prev) =>
        prev.map((c) =>
          c.id === resumeId
            ? { ...c, status: "uploaded", parsed_json: null }
            : c
        )
      );
      setPollingIds((prev) => new Set(prev).add(resumeId));
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

  // Client side search matching name/email/skills
  const filteredCandidates = candidates.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = c.full_name?.toLowerCase().includes(q) ?? false;
    const emailMatch = c.email?.toLowerCase().includes(q) ?? false;
    const skillsMatch = c.parsed_json?.skills?.some((s: string) => s.toLowerCase().includes(q)) ?? false;
    return nameMatch || emailMatch || skillsMatch;
  });

  const hasActiveFilters =
    locationFilter.trim() ||
    minExpFilter.trim() ||
    visaFilter.trim() ||
    workAuthFilter.trim() ||
    statusFilter.trim() ||
    searchQuery.trim();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Candidate Directory ({totalCount})</h1>
          <p className="mt-1 text-sm text-zinc-400">
            A master database of candidates. Upload resumes and filter profiles dynamically.
          </p>
        </div>

        <button
          onClick={() => setUploadOpen(true)}
          className="rounded-xl bg-zinc-900 dark:bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white transition cursor-pointer"
        >
          + Add Candidates
        </button>
      </div>

      {err && (
        <div className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {err}
        </div>
      )}

      {/* Google Drive Import Progress Card */}
      {importState.status !== 'idle' && (
        <div className="mt-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/10 p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">
              {importState.status === 'scanning' ? (
                <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                  <svg className="h-4 w-4 animate-spin text-zinc-400" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Scanning Google Drive...
                </span>
              ) : importState.status === 'importing' ? (
                <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                  <svg className="h-4 w-4 animate-spin text-violet-500" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Importing Files ({importState.current} / {importState.total})
                </span>
              ) : (
                <span className="text-emerald-605 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                  ✓ Google Drive Import Complete
                </span>
              )}
            </div>

            {importState.status === 'completed' && (
              <button
                onClick={() => setImportState(prev => ({ ...prev, status: 'idle' }))}
                className="text-xs text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                Dismiss
              </button>
            )}
          </div>

          <div className="mt-3 text-xs text-zinc-400 truncate">
            {importState.currentFileName}
          </div>

          {importState.total > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-zinc-200 dark:border-zinc-850 pt-3">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950/20 p-2.5 text-center">
                <div className="text-[10px] uppercase font-bold text-zinc-500">Processed</div>
                <div className="mt-0.5 text-sm font-bold text-zinc-800 dark:text-zinc-200">{importState.successCount + importState.failCount}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950/20 p-2.5 text-center">
                <div className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-500">Success</div>
                <div className="mt-0.5 text-sm font-bold text-emerald-550 dark:text-emerald-400">{importState.successCount}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950/20 p-2.5 text-center">
                <div className="text-[10px] uppercase font-bold text-red-600 dark:text-red-500">Failed</div>
                <div className="mt-0.5 text-sm font-bold text-red-550 dark:text-red-405">{importState.failCount}</div>
              </div>
            </div>
          )}

          {importState.errors.length > 0 && (
            <div className="mt-3 max-h-32 overflow-y-auto rounded-lg bg-zinc-50 dark:bg-zinc-950/50 p-2 text-xs space-y-1 divide-y divide-zinc-200 dark:divide-zinc-800/40">
              <div className="text-[10px] uppercase font-bold text-red-500 tracking-wider pb-1">Errors ({importState.errors.length})</div>
              {importState.errors.map((err, i) => (
                <div key={i} className="pt-1 text-zinc-500 flex flex-col">
                  <span className="font-semibold text-zinc-655 dark:text-zinc-300 truncate">{err.name}</span>
                  <span className="text-red-500/80 mt-0.5 text-[10px]">{err.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filter panel */}
      <div className="mt-6 grid gap-3 md:grid-cols-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/20 p-4 shadow-sm dark:shadow-none">
        <div className="md:col-span-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or skills..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
          />
        </div>
        <div>
          <input
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            placeholder="Filter location..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
          />
        </div>
        <div>
          <input
            value={minExpFilter}
            onChange={(e) => setMinExpFilter(e.target.value)}
            type="number"
            placeholder="Min Exp (years)"
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
          />
        </div>
        <div>
          <select
            value={visaFilter}
            onChange={(e) => setVisaFilter(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
          >
            <option value="">Any Visa Status</option>
            <option value="citizen">Citizen</option>
            <option value="green_card">Green Card</option>
            <option value="h1b">H1B</option>
          </select>
        </div>
        <div>
          <select
            value={workAuthFilter}
            onChange={(e) => setWorkAuthFilter(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
          >
            <option value="">Any Work Auth</option>
            <option value="authorized">Authorized</option>
            <option value="sponsorship">Sponsorship</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
        <div>
          Showing {filteredCandidates.length} of {totalCount} candidate{totalCount === 1 ? "" : "s"}
          {hasActiveFilters && " (filtered)"}
        </div>
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Selection Action Bar */}
      {selectedCandidateIds.size > 0 ? (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-violet-200 dark:border-violet-800/30 bg-violet-50/50 dark:bg-violet-950/10 px-4 py-3 text-sm animate-fade-in text-zinc-900 dark:text-zinc-100 shadow-sm">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={filteredCandidates.length > 0 && filteredCandidates.every((c) => selectedCandidateIds.has(c.id))}
              onChange={handleSelectAllOnPage}
              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-violet-600 focus:ring-violet-500 cursor-pointer"
            />
            <span className="font-semibold text-violet-800 dark:text-violet-300">
              {selectedCandidateIds.size} candidate{selectedCandidateIds.size > 1 ? "s" : ""} selected
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setSelectedCandidateIds(new Set())}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition cursor-pointer"
            >
              Deselect All
            </button>
            <button
              onClick={() => setDeleteMultipleOpen(true)}
              className="rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
            >
              Delete Selected
            </button>
          </div>
        </div>
      ) : (
        filteredCandidates.length > 0 && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/5 px-4 py-3 text-sm text-zinc-805 dark:text-zinc-200">
            <input
              type="checkbox"
              checked={false}
              onChange={handleSelectAllOnPage}
              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-violet-600 focus:ring-violet-500 cursor-pointer"
            />
            <button
              onClick={handleSelectAllOnPage}
              className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-205 transition cursor-pointer"
            >
              Select all on this page ({filteredCandidates.length})
            </button>
          </div>
        )
      )}

      {/* Candidate List Grid */}
      <div className="mt-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/20 shadow-sm dark:shadow-none overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <svg className="h-8 w-8 animate-spin text-zinc-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div className="mt-4 text-sm text-zinc-400">Loading master candidate database...</div>
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">👥</div>
            <div className="text-lg font-semibold text-zinc-850 dark:text-zinc-200">No candidates found</div>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {hasActiveFilters
                ? "Try adjusting your search query or filters to find candidates."
                : "Get started by adding candidate resumes directly into the directory."}
            </p>
            {!hasActiveFilters && (
              <button
                onClick={() => setUploadOpen(true)}
                className="mt-5 rounded-xl bg-zinc-950 dark:bg-zinc-100 border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 dark:text-zinc-950 hover:bg-zinc-900 dark:hover:bg-white transition cursor-pointer"
              >
                + Add candidates
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredCandidates.map((c) => (
              <Fragment key={c.id}>
                <div className={`px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/10 transition-colors flex items-start gap-4 ${selectedCandidateIds.has(c.id) ? "bg-violet-50/20 dark:bg-violet-950/5" : ""}`}>
                  <input
                    type="checkbox"
                    checked={selectedCandidateIds.has(c.id)}
                    onChange={() => handleSelectCandidate(c.id)}
                    className="mt-1 h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-violet-600 focus:ring-violet-500 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">
                          {c.full_name ?? "Unknown name"}
                        </h3>
                        <p className="text-xs text-zinc-500 truncate mt-0.5">
                          {c.original_filename}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {c.status === "uploaded" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400">
                            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Parsing
                          </span>
                        ) : (c.status === "failed" || c.status === "error") ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
                              Failed
                            </span>
                            <button
                              onClick={() => retryResume(c.id)}
                              disabled={retryingIds.has(c.id)}
                              className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/40 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 disabled:opacity-50 cursor-pointer"
                            >
                              {retryingIds.has(c.id) ? "Retrying..." : "Retry"}
                            </button>
                          </div>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            Ready
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metadata labels */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      {c.email && <span className="text-zinc-650 dark:text-zinc-300">{c.email}</span>}
                      {c.phone && <span className="text-zinc-400 dark:text-zinc-500">{c.phone}</span>}
                      {c.parsed_json?.linkedin && (
                        <a
                          href={c.parsed_json.linkedin.startsWith("http") ? c.parsed_json.linkedin : `https://${c.parsed_json.linkedin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                          </svg>
                          LinkedIn
                        </a>
                      )}
                      {c.parsed_json?.candidate_location && (
                        <span className="rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300">
                          📍 {c.parsed_json.candidate_location}
                        </span>
                      )}
                      {c.parsed_json?.years_experience != null && c.parsed_json.years_experience > 0 && (
                        <span className="rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300">
                          {c.parsed_json.years_experience}y exp
                        </span>
                      )}
                      {c.parsed_json?.visa_status && (
                        <span className="rounded-md bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-900/30 px-1.5 py-0.5 text-blue-700 dark:text-blue-250">
                          {c.parsed_json.visa_status.replace("_", " ")}
                        </span>
                      )}
                      {c.parsed_json?.work_authorization && (
                        <span className="rounded-md bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-900/30 px-1.5 py-0.5 text-indigo-700 dark:text-indigo-250">
                          {c.parsed_json.work_authorization}
                        </span>
                      )}
                    </div>

                    {/* Actions row */}
                    <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
                      <div>Added {new Date(c.created_at).toLocaleString()}</div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setExpandedRow(expandedRow === c.id ? null : c.id)}
                          disabled={c.status === "uploaded"}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-semibold disabled:opacity-40 cursor-pointer"
                        >
                          {expandedRow === c.id ? "Hide details" : "Show details"}
                        </button>
                        <a
                          href={`/api/resumes/${c.id}/view`}
                          target="_blank"
                          rel="noreferrer"
                          className={`rounded-lg border px-2.5 py-1 font-semibold ${
                            c.status === "uploaded"
                              ? "border-zinc-200 dark:border-zinc-800 bg-zinc-100/30 text-zinc-400 cursor-not-allowed"
                              : "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/60"
                          }`}
                          onClick={(e) => { if (c.status === "uploaded") e.preventDefault(); }}
                        >
                          View resume
                        </a>
                        <button
                          onClick={() => { setDeleteCandidate(c); setDeleteOpen(true); }}
                          disabled={c.status === "uploaded"}
                          className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 disabled:opacity-30 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Details Accordion Panel */}
                {expandedRow === c.id && c.status !== "failed" && c.status !== "error" && c.parsed_json && (
                  <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/10 px-6 py-6 space-y-6">
                    {c.parsed_json.summary && (
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Summary</h4>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-3xl">
                          {c.parsed_json.summary}
                        </p>
                      </div>
                    )}

                    {c.parsed_json.skills?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Skills</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {c.parsed_json.skills.map((s: string, idx: number) => (
                            <span
                              key={idx}
                              className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {c.parsed_json.experience?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Experience</h4>
                        <div className="grid gap-4 md:grid-cols-2">
                          {c.parsed_json.experience.map((exp: any, idx: number) => (
                            <div
                              key={idx}
                              className="bg-white dark:bg-zinc-950 rounded-lg p-4 border border-zinc-200 dark:border-zinc-800/80 shadow-sm"
                            >
                              <div className="font-semibold text-zinc-800 dark:text-zinc-250">{exp.role || "Role"}</div>
                              <div className="text-sm text-blue-600 dark:text-blue-400 font-semibold">{exp.company}</div>
                              <div className="text-xs text-zinc-500 mt-1">{exp.duration}</div>
                              {exp.description && (
                                <p className="text-xs text-zinc-650 dark:text-zinc-400 mt-2 leading-relaxed">{exp.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {c.parsed_json.education?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Education</h4>
                        <div className="grid gap-2 md:grid-cols-2">
                          {c.parsed_json.education.map((edu: any, idx: number) => (
                            <div
                              key={idx}
                              className="bg-white dark:bg-zinc-950 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800/80 flex justify-between items-start"
                            >
                              <div>
                                <div className="text-sm font-semibold text-zinc-850 dark:text-zinc-200">{edu.degree}</div>
                                <div className="text-xs text-zinc-500 mt-0.5">{edu.school}</div>
                              </div>
                              <div className="text-xs text-zinc-400">{edu.year}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Error detail panel */}
                {expandedRow === c.id && (c.status === "failed" || c.status === "error") && c.parsed_json?.error && (
                  <div className="border-t border-zinc-200 dark:border-zinc-800 bg-red-50/20 dark:bg-red-950/5 px-6 py-6">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-red-500">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold text-red-700 dark:text-red-300">Parsing Failed</h4>
                          {c.parsed_json.error_code && (
                            <span className="rounded bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 text-[10px] font-mono text-red-600 dark:text-red-300/80">
                              {c.parsed_json.error_code}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-zinc-650 dark:text-zinc-400 leading-relaxed">{c.parsed_json.error}</p>
                        <button
                          onClick={() => retryResume(c.id)}
                          disabled={retryingIds.has(c.id)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/60 disabled:opacity-50 transition-colors"
                        >
                          <svg className={`h-3.5 w-3.5 ${retryingIds.has(c.id) ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          {retryingIds.has(c.id) ? "Retrying..." : "Retry Parsing"}
                        </button>
                        {!c.parsed_json.retryable && (
                          <p className="mt-2 text-xs text-zinc-500">Note: If you have corrected the configuration/API key error, click Retry Parsing above to attempt parsing again.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              const prev = Math.max(1, page - 1);
              setPage(prev);
              fetchCandidates(prev);
            }}
            disabled={page === 1}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-sm font-semibold disabled:opacity-40 cursor-pointer"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => {
              const next = Math.min(totalPages, page + 1);
              setPage(next);
              fetchCandidates(next);
            }}
            disabled={page === totalPages}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-sm font-semibold disabled:opacity-40 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}

      {/* Upload Resumes Modal */}
      {uploadOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/70" onClick={() => setUploadOpen(false)} />
          <div className="relative w-full max-w-xl rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 font-bold">Add candidates</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Upload a PDF/DOCX/TXT/ZIP or import from Google Drive directly into the Candidate Directory.
                </p>
              </div>
              <button
                onClick={() => setUploadOpen(false)}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/40 px-3 py-2 text-sm hover:bg-zinc-250 cursor-pointer"
              >
                X
              </button>
            </div>

            <form onSubmit={handleUpload} className="mt-5 space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.zip,application/pdf,application/zip"
                multiple
                onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
                className="hidden"
              />

              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/20 p-4">
                <div className="text-sm font-semibold font-bold mb-3">Local File Upload</div>
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center rounded-xl bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white cursor-pointer"
                  >
                    Select Files
                  </button>
                  <div className="flex-1 rounded-xl border border-zinc-205 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 px-4 py-2 text-sm text-zinc-400 truncate">
                    {files.length > 1 ? `${files.length} files selected` : files.length === 1 ? files[0].name : "No files selected"}
                  </div>
                  {files.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFiles([])}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-sm hover:bg-zinc-200 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Google Drive Integration */}
              <div className="border-t border-zinc-200 dark:border-zinc-900 pt-4 flex flex-col gap-2">
                {driveImporting ? (
                  <div className="flex items-center justify-center gap-2 py-2">
                    <svg className="h-4 w-4 animate-spin text-zinc-400" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-xs text-zinc-405">Connecting Google Drive...</span>
                  </div>
                ) : (!gapiLoaded || !gisLoaded) ? (
                  <div className="text-center py-2 text-xs text-zinc-500 font-medium">
                    Loading Google APIs...
                  </div>
                ) : (
                  <>
                    <div className="text-xs font-semibold text-zinc-450 dark:text-zinc-400 px-1 mb-1">Import from Google Drive:</div>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => getGoogleAuthTokenAndOpenPicker('files')}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 py-2 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900/70 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        📂 Select Resumes
                      </button>
                      <button
                        type="button"
                        onClick={() => getGoogleAuthTokenAndOpenPicker('folder')}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 py-2 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900/70 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        📁 Import Folder
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-zinc-100 dark:border-zinc-900 pt-4">
                <button
                  type="button"
                  onClick={() => setUploadOpen(false)}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-4 py-2 text-xs font-semibold hover:bg-zinc-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={files.length === 0 || uploading}
                  className="rounded-xl bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-50 dark:text-zinc-950 disabled:opacity-40 cursor-pointer"
                >
                  {uploading ? "Uploading..." : files.length > 1 ? `Upload ${files.length} Files` : "Upload File"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Candidate Modal */}
      {deleteOpen && deleteCandidate && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDeleteOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl text-zinc-900 dark:text-zinc-100">
            <h2 className="text-lg font-semibold text-red-500 dark:text-red-400 font-bold">Remove candidate?</h2>
            <p className="mt-2 text-sm text-zinc-650 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to remove <span className="font-bold text-zinc-800 dark:text-zinc-200">{deleteCandidate.full_name || "this candidate"}</span>?
              This will permanently delete their parsed profile and resume document from the database.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 py-2.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 cursor-pointer"
              >
                {deleting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Multiple Candidates Modal */}
      {deleteMultipleOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDeleteMultipleOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl text-zinc-900 dark:text-zinc-100">
            <h2 className="text-lg font-semibold text-red-500 dark:text-red-400 font-bold">Remove multiple candidates?</h2>
            <p className="mt-2 text-sm text-zinc-650 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to remove <span className="font-bold text-zinc-800 dark:text-zinc-200">{selectedCandidateIds.size}</span> selected candidates?
              This will permanently delete their parsed profiles and resume documents from the database. This action cannot be undone.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setDeleteMultipleOpen(false)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 py-2.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 cursor-pointer"
              >
                {deleting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
