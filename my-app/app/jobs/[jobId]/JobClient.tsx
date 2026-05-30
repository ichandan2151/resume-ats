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

  const [initialLoad, setInitialLoad] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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

  // retry state
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

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
      setInitialLoad(false);
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

  // Create and open the Google Picker dialog (configured for files multi-select or folder select)
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
            // Check if it's a supported file type by extension or mime type
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
            jobId,
            staggerIndex: i, // pass staggering delay index
          }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Upload failed");

        setImportState(prev => ({
          ...prev,
          successCount: prev.successCount + 1,
        }));
        
        // Dynamic staggered refreshes so they populate live in table
        refreshResumes().catch(console.error);
      } catch (err: any) {
        console.error("File import failed:", doc.name, err);
        setImportState(prev => ({
          ...prev,
          failCount: prev.failCount + 1,
          errors: [...prev.errors, { name: doc.name, error: err.message ?? "Unknown error" }],
        }));
      }

      // 500ms delay between API posts to spread out upload request load
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setImportState(prev => ({
      ...prev,
      status: 'completed',
    }));

    refreshResumes().catch(console.error);
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

  // Handle the selection from Google Picker
  async function pickerCallback(data: any, accessToken: string, mode: 'files' | 'folder') {
    if (data.action === (window as any).google.picker.Action.PICKED) {
      const docs = data.docs;
      if (!docs || docs.length === 0) {
        setDriveImporting(false);
        return;
      }

      setUploadOpen(false); // Close upload modal immediately to let user see progress card

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {initialLoad ? (
          <div className="flex flex-col items-center justify-center py-32">
            <svg className="h-8 w-8 animate-spin text-zinc-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div className="mt-4 text-sm text-zinc-400">Loading job details...</div>
          </div>
        ) : (
        <>
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
                          ) : (r.status === "failed" || r.status === "error") ? (
                            <div className="space-y-1.5">
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-900/50 bg-red-950/40 px-3 py-1 text-xs text-red-400">
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                Failed
                              </span>
                              {r.parsed_json?.error_code && (
                                <div className="text-[10px] text-red-400/70 font-mono">
                                  {r.parsed_json.error_code}
                                </div>
                              )}
                              {r.parsed_json?.retryable && (
                                <button
                                  onClick={() => retryResume(r.id)}
                                  disabled={retryingIds.has(r.id)}
                                  className="inline-flex items-center gap-1 rounded bg-amber-900/40 px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-900/60 disabled:opacity-50 transition-colors"
                                >
                                  <svg className={`h-3 w-3 ${retryingIds.has(r.id) ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                  {retryingIds.has(r.id) ? "Retrying..." : "Retry"}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span
                              className={`rounded-full border px-3 py-1 text-xs ${
                                r.status === "scored"
                                  ? "border-emerald-900/50 bg-emerald-950/40 text-emerald-400"
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
                            {(r.status === "failed" || r.status === "error") && r.parsed_json?.retryable && (
                              <button
                                onClick={() => retryResume(r.id)}
                                disabled={retryingIds.has(r.id)}
                                className="rounded bg-amber-900/40 px-2 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-900/60 disabled:opacity-50"
                              >
                                {retryingIds.has(r.id) ? "..." : "Retry"}
                              </button>
                            )}
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
                      {/* Error detail row for failed resumes */}
                      {(r.status === "failed" || r.status === "error") && r.parsed_json?.error && expandedRow === r.id && (
                        <tr key={`${r.id}-err`} className="bg-red-950/10">
                          <td colSpan={6} className="px-5 py-0">
                            <div className="border-l-2 border-red-900/50 pl-6 py-5">
                              <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4">
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 rounded-lg bg-red-900/30 p-1.5">
                                    <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                    </svg>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className="text-sm font-semibold text-red-300">Parsing Failed</h4>
                                      {r.parsed_json.error_code && (
                                        <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-[10px] font-mono text-red-300/80">
                                          {r.parsed_json.error_code}
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                                      {r.parsed_json.error}
                                    </p>
                                    {r.parsed_json.retryable && (
                                      <button
                                        onClick={() => retryResume(r.id)}
                                        disabled={retryingIds.has(r.id)}
                                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-900/40 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-900/60 disabled:opacity-50 transition-colors"
                                      >
                                        <svg className={`h-3.5 w-3.5 ${retryingIds.has(r.id) ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        {retryingIds.has(r.id) ? "Retrying..." : "Retry Parsing"}
                                      </button>
                                    )}
                                    {!r.parsed_json.retryable && (
                                      <p className="mt-2 text-xs text-zinc-500">
                                        This error is not retryable. Please check your configuration or re-upload the resume.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {expandedRow === r.id && r.status !== "failed" && r.status !== "error" && (
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

        {/* Google Drive Import Progress Card */}
        {importState.status !== 'idle' && (
          <div className="fixed bottom-6 right-6 z-[80] w-96 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl transition-all duration-300">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  {importState.status === 'scanning' ? (
                    <>
                      <svg className="h-4 w-4 animate-spin text-zinc-400" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Scanning Google Drive...
                    </>
                  ) : importState.status === 'importing' ? (
                    <>
                      <svg className="h-4 w-4 animate-spin text-blue-400" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Importing Resumes...
                    </>
                  ) : (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Import Completed
                    </span>
                  )}
                </h4>
                <p className="mt-1 text-xs text-zinc-400 truncate max-w-[280px]">
                  {importState.currentFileName || 'Preparing...'}
                </p>
              </div>
              {importState.status === 'completed' && (
                <button
                  onClick={() => setImportState(prev => ({ ...prev, status: 'idle' }))}
                  className="rounded-lg bg-zinc-800 p-1 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {importState.status !== 'scanning' && importState.total > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                  <span>{importState.current} of {importState.total} files</span>
                  <span>{Math.round((importState.current / importState.total) * 100)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                    style={{ width: `${(importState.current / importState.total) * 100}%` }}
                  />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-zinc-950/40 p-2">
                    <div className="font-semibold text-zinc-400">Total</div>
                    <div className="mt-0.5 text-sm font-bold text-zinc-200">{importState.total}</div>
                  </div>
                  <div className="rounded-lg bg-emerald-950/20 border border-emerald-900/30 p-2">
                    <div className="font-semibold text-emerald-400">Success</div>
                    <div className="mt-0.5 text-sm font-bold text-emerald-300">{importState.successCount}</div>
                  </div>
                  <div className="rounded-lg bg-red-950/20 border border-red-900/30 p-2">
                    <div className="font-semibold text-red-400">Failed</div>
                    <div className="mt-0.5 text-sm font-bold text-red-300">{importState.failCount}</div>
                  </div>
                </div>
              </div>
            )}

            {importState.errors.length > 0 && (
              <div className="mt-3 max-h-32 overflow-y-auto rounded-lg bg-zinc-950/50 p-2 text-xs space-y-1 divide-y divide-zinc-800/40">
                <div className="text-[10px] uppercase font-bold text-red-400 tracking-wider pb-1">Errors ({importState.errors.length})</div>
                {importState.errors.map((err, i) => (
                  <div key={i} className="pt-1 text-zinc-400 flex flex-col">
                    <span className="font-semibold text-zinc-300 truncate">{err.name}</span>
                    <span className="text-red-400/80 mt-0.5 text-[10px]">{err.error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
          driveImporting={driveImporting}
          gapiLoaded={gapiLoaded}
          gisLoaded={gisLoaded}
          onGoogleDriveImport={getGoogleAuthTokenAndOpenPicker}
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
          onDeleted={() => { window.location.href = "/dashboard"; }}
        />
        </>
        )}
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
  driveImporting: boolean;
  gapiLoaded: boolean;
  gisLoaded: boolean;
  onGoogleDriveImport: (mode: 'files' | 'folder') => void;
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
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm hover:bg-zinc-900/70 cursor-pointer"
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
                className="inline-flex items-center justify-center rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white cursor-pointer"
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
                  className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-sm hover:bg-zinc-900/60 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={!props.file || props.uploading}
            className="w-full rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-white disabled:opacity-60 cursor-pointer"
          >
            {props.uploading ? "Uploading..." : "Upload"}
          </button>

          <div className="relative my-4 flex py-1 items-center">
            <div className="flex-grow border-t border-zinc-800"></div>
            <span className="flex-shrink mx-4 text-zinc-500 text-xs uppercase tracking-wider font-semibold">Or</span>
            <div className="flex-grow border-t border-zinc-800"></div>
          </div>

          {props.driveImporting ? (
            <div className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm font-semibold text-zinc-400">
              <svg className="h-4 w-4 animate-spin text-zinc-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Connecting Google Drive...
            </div>
          ) : (!props.gapiLoaded || !props.gisLoaded) ? (
            <div className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm font-semibold text-zinc-500">
              Loading Google integration...
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-zinc-400 px-1">Import from Google Drive:</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => props.onGoogleDriveImport('files')}
                  className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-900/60 transition-colors cursor-pointer"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19.43 12.98L12.01 2.0199C11.83 1.7099 11.49 1.5199 11.13 1.5199C10.77 1.5199 10.43 1.7099 10.25 2.0199L2.83 12.98C2.65 13.29 2.65 13.67 2.83 13.98L6.56 20.48C6.74 20.79 7.07 20.98 7.43 20.98C7.79 20.98 8.12 20.79 8.3 20.48L15.72 9.5199C15.9 9.2099 16.24 9.0199 16.6 9.0199C16.96 9.0199 17.3 9.2099 17.48 9.5199L21.21 16.02C21.39 16.33 21.39 16.71 21.21 17.02L19.43 20.12C19.25 20.43 18.91 20.62 18.55 20.62C18.19 20.62 17.85 20.43 17.67 20.12L13.94 13.62C13.76 13.31 13.76 12.93 13.94 12.62L15.72 9.5199" fill="#FFC107"/>
                    <path d="M10.25 2.0199L2.83 12.98C2.65 13.29 2.65 13.67 2.83 13.98L6.56 20.48C6.74 20.79 7.07 20.98 7.43 20.98H14.89L10.25 12.62L12.03 9.5199L10.25 2.0199Z" fill="#00796B"/>
                    <path d="M12.01 2.0199L19.43 12.98C19.61 13.29 19.61 13.67 19.43 13.98L15.7 20.48C15.52 20.79 15.18 20.98 14.82 20.98H7.36L12.01 12.62L10.23 9.5199L12.01 2.0199Z" fill="#4CAF50"/>
                  </svg>
                  Multiple Files
                </button>
                <button
                  type="button"
                  onClick={() => props.onGoogleDriveImport('folder')}
                  className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-900/60 transition-colors cursor-pointer"
                >
                  <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Entire Folder
                </button>
              </div>
            </div>
          )}

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
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  jobId: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete job");

      // Redirect to dashboard
      onDeleted();
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
