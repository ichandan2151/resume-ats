"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import CandidateDirectory from "./CandidateDirectory";

type SearchCampaign = {
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

  const [searchCampaigns, setSearchCampaigns] = useState<SearchCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [activeTab, setActiveTab] = useState<"searchCampaigns" | "candidates" | "profile">("searchCampaigns");
  const [totalResumes, setTotalResumes] = useState<number>(0);
  const [loadingResumesCount, setLoadingResumesCount] = useState(true);

  async function fetchResumesCount() {
    try {
      const res = await fetch("/api/profile");
      const json = await res.json();
      if (res.ok) {
        setTotalResumes(json.totalResumes ?? 0);
        return json.totalResumes ?? 0;
      }
    } catch (e) {
      console.error("Error fetching resumes count:", e);
    } finally {
      setLoadingResumesCount(false);
    }
    return 0;
  }

  useEffect(() => {
    async function initDashboard() {
      let currentTab: "searchCampaigns" | "candidates" | "profile" = "searchCampaigns";
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "candidates" || tab === "profile" || tab === "searchCampaigns") {
        currentTab = tab as any;
        setActiveTab(currentTab);
      }

      const count = await fetchResumesCount();
      // If there's no tab in URL and resume count is 0, default to candidates (Candidate Directory)
      if (!tab && count === 0) {
        setActiveTab("candidates");
        const url = new URL(window.location.href);
        url.searchParams.set("tab", "candidates");
        window.history.replaceState({}, "", url.toString());
      }
    }

    initDashboard();
  }, []);

  const handleTabChange = (tab: "searchCampaigns" | "candidates" | "profile") => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.pushState({}, "", url.toString());
  };

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // delete campaign modal state
  const [deleteCampaignId, setDeleteCampaignId] = useState<string | null>(null);
  const [deleteCampaignTitle, setDeleteCampaignTitle] = useState<string>("");
  const [deleteCampaignOpen, setDeleteCampaignOpen] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState(false);

  // Onboarding Tour state
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  // modal form
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  const tourSteps = useMemo(() => {
    if (open) {
      return [
        {
          title: "Define SearchCampaign Title 🏷️",
          description: "Enter the search title you are targeting (e.g., 'Senior Frontend Engineer').",
          icon: "🏷️",
          gradient: "from-violet-600 to-indigo-600",
          shadow: "shadow-indigo-900/35",
          badge: "Criteria Title",
          targetId: "tour-modal-title"
        },
        {
          title: "SearchCampaign Requirements 📝",
          description: "Paste the search description. The AI parses candidate resumes against these exact requirements to score them.",
          icon: "📝",
          gradient: "from-fuchsia-600 to-pink-600",
          shadow: "shadow-pink-900/35",
          badge: "Criteria Requirements",
          targetId: "tour-modal-description"
        },
        {
          title: "Launch Search Campaign 🚀",
          description: "Click 'Search candidate' to create your criteria. This will redirect you to the scoring workspace detail page.",
          icon: "🚀",
          gradient: "from-emerald-600 to-teal-600",
          shadow: "shadow-emerald-900/35",
          badge: "Launch",
          targetId: "tour-modal-submit"
        }
      ];
    }

    return [
      {
        title: "Welcome to Patternix! 🚀",
        description: "This is your new AI-driven workspace branding. Patternix is built to scan, parse, and score candidate resumes automatically.",
        icon: "👋",
        gradient: "from-violet-600 to-indigo-600",
        shadow: "shadow-indigo-900/35",
        badge: "Getting Started",
        targetId: "tour-brand"
      },
      {
        title: "Toggle Workspace Tabs ↔️",
        description: "Easily switch between the 'Search Candidates' dashboard (managing candidate databases) and the 'Profile' configurations.",
        icon: "🧭",
        gradient: "from-fuchsia-600 to-pink-600",
        shadow: "shadow-pink-900/35",
        badge: "Navigation",
        targetId: "tour-nav-tabs"
      },
      {
        title: "Start a Search Campaign 📋",
        description: totalResumes === 0
          ? "Once you have resumes in your Candidate Directory, click '+ Search Candidate' to define search description and score candidates."
          : "Click '+ Search Candidate' to define a search description. The AI parses applicant files against these requirements to score them.",
        icon: "💼",
        gradient: "from-blue-600 to-cyan-600",
        shadow: "shadow-blue-900/35",
        badge: "Campaign Creation",
        targetId: "tour-create-campaign"
      },
      {
        title: "Active Search Campaigns Grid 📂",
        description: "All your active hiring campaigns appear here. You can see candidate counts, average scores, and creation dates at a glance. Click any card to enter the workspace.",
        icon: "📁",
        gradient: "from-emerald-600 to-teal-600",
        shadow: "shadow-emerald-900/35",
        badge: "Database List",
        targetId: "tour-searchCampaigns-list"
      },
      {
        title: "You're Ready to Hire! 🎉",
        description: "Get started by creating your first campaign, upload candidate resumes, and watch the AI grade them instantly. Re-run this tour at any time from your Profile preferences.",
        icon: "⚡",
        gradient: "from-amber-600 to-orange-600",
        shadow: "shadow-amber-900/35",
        badge: "Completed",
        targetId: null
      }
    ];
  }, [open, totalResumes]);

  useEffect(() => {
    const tourCompleted = localStorage.getItem("patternix_onboarding_completed");
    if (!tourCompleted) {
      setShowTour(true);
    }
  }, []);

  const handleNextTourStep = () => {
    if (!open && tourStep === 2) {
      setOpen(true);
      setTourStep(0);
      return;
    }

    if (tourStep < tourSteps.length - 1) {
      setTourStep(prev => prev + 1);
    } else {
      handleCompleteTour();
    }
  };

  const handlePrevTourStep = () => {
    if (open && tourStep === 0) {
      setOpen(false);
      setTourStep(2);
      return;
    }

    if (tourStep > 0) {
      setTourStep(prev => prev - 1);
    }
  };

  const handleCompleteTour = () => {
    localStorage.setItem("patternix_onboarding_completed", "true");
    setShowTour(false);
    setTourStep(0);
  };

  const canCreate =
    title.trim().length > 0 && description.trim().length > 0 && !creating;

  async function loadSearchCampaigns() {
    setLoadingCampaigns(true);
    try {
      const res = await fetch("/api/search-candidate");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load search campaigns");
      setSearchCampaigns(json.data ?? []);
    } finally {
      setLoadingCampaigns(false);
    }
  }

  useEffect(() => {
    loadSearchCampaigns().catch((e) => setErr(e.message));
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function createSearchCampaign() {
    setErr(null);
    if (!title.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/search-candidate", {
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
      if (!res.ok) throw new Error(json?.error ?? "Failed to create campaign");

      // reset + refresh
      setTitle("");
      setCompany("");
      setLocation("");
      setDescription("");
      setOpen(false);

      if (json.data?.id) {
        localStorage.setItem("patternix_onboarding_completed", "true");
        window.location.href = `/search-candidate/${json.data.id}`;
      } else {
        await loadSearchCampaigns();
      }
    } catch (e: any) {
      setErr(e.message ?? "Error");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteSearchCampaign() {
    if (!deleteCampaignId) return;
    setDeletingCampaign(true);
    setErr(null);
    try {
      const res = await fetch(`/api/search-candidate/${deleteCampaignId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to delete campaign");
      setDeleteCampaignOpen(false);
      setDeleteCampaignId(null);
      setDeleteCampaignTitle("");
      await loadSearchCampaigns();
    } catch (e: any) {
      setErr(e.message ?? "Delete failed");
    } finally {
      setDeletingCampaign(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      <NavBar
        active={activeTab}
        onCampaigns={() => handleTabChange("searchCampaigns")}
        onCandidates={() => handleTabChange("candidates")}
        onProfile={() => handleTabChange("profile")}
        onLogout={logout}
        onCreateCampaign={() => {
          setOpen(true);
          if (showTour) {
            setTourStep(0);
          }
        }}
      />

      <div className="mx-auto max-w-6xl px-6 py-10">
        {activeTab === "searchCampaigns" ? (
          <>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Search Candidates</h1>
                <p className="mt-1 text-sm text-zinc-400">
                  Search candidates and manage campaigns.
                </p>
              </div>

              <button
                id="tour-create-campaign"
                disabled={totalResumes === 0}
                onClick={() => {
                  setOpen(true);
                  if (showTour) {
                    setTourStep(0);
                  }
                }}
                className="hidden rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white md:inline-flex disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-zinc-100"
                title={totalResumes === 0 ? "Upload candidate resumes in the Candidate Directory first to enable search" : ""}
              >
                + Search Candidate
              </button>
            </div>

            {err && (
              <div className="mt-4 rounded-xl border border-red-200 dark:border-red-800/30 bg-red-50 dark:bg-red-950/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                {err}
              </div>
            )}

            {loadingCampaigns ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/20 p-5 shadow-sm dark:shadow-none relative"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="h-5 w-2/3 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                        <div className="mt-2 h-3.5 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                      </div>
                      <div className="h-6 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="h-3.5 w-full rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                      <div className="h-3.5 w-5/6 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-3">
                      <div className="h-12 rounded-xl bg-zinc-100 dark:bg-zinc-900/50 animate-pulse" />
                      <div className="h-12 rounded-xl bg-zinc-100 dark:bg-zinc-900/50 animate-pulse" />
                      <div className="h-12 rounded-xl bg-zinc-100 dark:bg-zinc-900/50 animate-pulse" />
                    </div>
                    <div className="mt-4 h-3 w-40 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2" id="tour-searchCampaigns-list">
                {searchCampaigns.map((j) => (
                  <a
                    key={j.id}
                    href={`/search-candidate/${j.id}`}
                    className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 p-5 hover:bg-zinc-50 dark:hover:bg-zinc-900/45 transition shadow-sm dark:shadow-none relative"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-950 dark:group-hover:text-white pr-8">
                          {j.title}
                        </div>
                        <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                          {j.company ?? "-"} - {j.location ?? "-"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950/40 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-300">
                          {j.candidate_count} candidates
                        </div>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteCampaignId(j.id);
                            setDeleteCampaignTitle(j.title);
                            setDeleteCampaignOpen(true);
                          }}
                          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/40 dark:bg-zinc-900/40 p-2 text-zinc-600 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/20 transition cursor-pointer"
                          title="Delete SearchCampaign"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {j.description && (
                      <div className="mt-3 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
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

                    <div className="mt-4 text-xs text-zinc-500 dark:text-zinc-500">
                      Created: {new Date(j.created_at).toLocaleString()}
                    </div>
                  </a>
                ))}

                {searchCampaigns.length === 0 && (
                  totalResumes === 0 ? (
                    <div className="col-span-full rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/10 p-8 text-center max-w-lg mx-auto my-6 shadow-sm dark:shadow-none">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/20 text-amber-500 mb-4 text-xl">
                        ⚠️
                      </div>
                      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Upload Resumes to Enable Search</h3>
                      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                        Before launching a search campaign, you must upload candidate resumes to the Candidate Directory. Patternix uses this directory to auto-import and score candidates.
                      </p>
                      <div className="mt-5 flex justify-center">
                        <button
                          onClick={() => handleTabChange("candidates")}
                          className="rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white px-4 py-2.5 text-sm font-semibold text-zinc-50 dark:text-zinc-950 transition cursor-pointer"
                        >
                          Go to Candidate Directory & Upload
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="col-span-full rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/10 p-8 text-center max-w-lg mx-auto my-6 shadow-sm dark:shadow-none">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 dark:bg-violet-950/20 text-violet-500 mb-4 text-xl">
                        💼
                      </div>
                      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Create Your First Search Campaign</h3>
                      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                        You have candidate resumes in your Candidate Directory! Now create a search campaign with your job description and requirements to grade them.
                      </p>
                      <div className="mt-5 flex justify-center">
                        <button
                          onClick={() => {
                            setOpen(true);
                            if (showTour) {
                              setTourStep(0);
                            }
                          }}
                          className="rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white px-4 py-2.5 text-sm font-semibold text-zinc-50 dark:text-zinc-950 transition cursor-pointer"
                        >
                          + Create Search Campaign
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </>
        ) : activeTab === "candidates" ? (
          <CandidateDirectory onResumesChanged={fetchResumesCount} />
        ) : (
          <ProfileCard onStartTour={() => {
            handleTabChange("searchCampaigns");
            setTourStep(0);
            setShowTour(true);
          }} />
        )}
      </div>

      <CreateSearchCampaignModal
        open={open}
        onClose={() => {
          setOpen(false);
          if (showTour) {
            setTourStep(2);
          }
        }}
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
        onCreate={createSearchCampaign}
      />

      <OnboardingTourModal
        open={showTour}
        step={tourStep}
        steps={tourSteps}
        isModalOpen={open}
        onNext={handleNextTourStep}
        onPrev={handlePrevTourStep}
        onClose={handleCompleteTour}
      />

      <DeleteSearchCampaignModal
        open={deleteCampaignOpen}
        onClose={() => setDeleteCampaignOpen(false)}
        campaignTitle={deleteCampaignTitle}
        onConfirm={handleDeleteSearchCampaign}
        deleting={deletingCampaign}
      />
    </div>
  );
}

function NavBar(props: {
  active: "searchCampaigns" | "candidates" | "profile";
  onCampaigns: () => void;
  onCandidates: () => void;
  onProfile: () => void;
  onLogout: () => void;
  onCreateCampaign: () => void;
}) {
  return (
    <div className="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-900 bg-white/70 dark:bg-zinc-950/70 backdrop-blur transition-colors duration-300">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/40 px-3 py-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100" id="tour-brand">
            Patternix
          </div>

          <div className="hidden items-center gap-2 md:flex" id="tour-nav-tabs">
            <NavItem
              active={props.active === "searchCampaigns"}
              onClick={props.onCampaigns}
              label="Search Candidates"
            />
            <NavItem
              active={props.active === "candidates"}
              onClick={props.onCandidates}
              label="Candidate Directory"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          <button
            onClick={props.onProfile}
            className={[
              "rounded-xl px-4 py-2 text-sm font-semibold transition cursor-pointer",
              props.active === "profile"
                ? "bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950 border border-transparent"
                : "border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/30 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-900/60",
            ].join(" ")}
          >
            Profile
          </button>

          <button
            onClick={props.onLogout}
            className="rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/10 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-100/60 dark:hover:bg-red-950/30 transition cursor-pointer"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="mx-auto flex max-w-6xl gap-2 px-6 pb-3 md:hidden">
        <NavItem
          active={props.active === "searchCampaigns"}
          onClick={props.onCampaigns}
          label="Search Candidates"
        />
        <NavItem
          active={props.active === "candidates"}
          onClick={props.onCandidates}
          label="Candidate Directory"
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
        "rounded-xl px-3 py-2 text-sm font-semibold transition cursor-pointer",
        active
          ? "bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950"
          : "bg-zinc-100 dark:bg-zinc-900/30 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-900/60",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-950/40 p-3">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

function DeleteSearchCampaignModal({
  open,
  onClose,
  campaignTitle,
  onConfirm,
  deleting,
}: {
  open: boolean;
  onClose: () => void;
  campaignTitle: string;
  onConfirm: () => void;
  deleting: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl text-zinc-900 dark:text-zinc-100">
        <div className="text-lg font-semibold text-red-500 dark:text-red-400">Delete SearchCampaign?</div>
        <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Are you sure you want to delete <strong className="text-zinc-800 dark:text-zinc-200">{campaignTitle}</strong>? Candidates from this campaign will remain available in the Candidate Directory.
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/40 dark:bg-zinc-900/40 px-4 py-2 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/70"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
          >
            {deleting ? "Deleting..." : "Delete SearchCampaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateSearchCampaignModal(props: {
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
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Search Candidate</div>
            <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Add details to organize candidates.
            </div>
          </div>
          <button
            onClick={props.onClose}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/40 px-3 py-2 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-900/70 text-zinc-600 dark:text-zinc-400 cursor-pointer"
          >
            X
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <input
            id="tour-modal-title"
            value={props.title}
            onChange={(e) => props.setTitle(e.target.value)}
            placeholder="SearchCampaign title (required)"
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 px-4 py-3 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={props.company}
              onChange={(e) => props.setCompany(e.target.value)}
              placeholder="Company (optional)"
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 px-4 py-3 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
            />
            <input
              value={props.location}
              onChange={(e) => props.setLocation(e.target.value)}
              placeholder="Location (optional)"
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 px-4 py-3 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
            />
          </div>
          <textarea
            id="tour-modal-description"
            value={props.description}
            onChange={(e) => props.setDescription(e.target.value)}
            rows={5}
            placeholder="SearchCampaign description (required)"
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 px-4 py-3 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-600"
          />
        </div>

        <button
          id="tour-modal-submit"
          onClick={props.onCreate}
          disabled={!props.canCreate}
          className="mt-5 w-full rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white px-4 py-3 text-sm font-semibold text-zinc-50 dark:text-zinc-950 disabled:opacity-60 cursor-pointer"
        >
          {props.creating ? "Creating..." : "Search candidate"}
        </button>
      </div>
    </div>
  );
}

function ProfileCard(props: { onStartTour: () => void }) {
  const [profile, setProfile] = useState<{
    email: string;
    campaignCount: number;
    resumeCount: number;
    totalResumes: number;
    directoryOnlyCount: number;
    uniqueCandidatesCount: number;
    plan: string;
    usageLimit: number;
    fullName?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<"free" | "pro">("free");
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);

  // Edit profile state
  const [editOpen, setEditOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const [editDraft, setEditDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [avatarUrlDraft, setAvatarUrlDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // Settings states
  const [emailNotify, setEmailNotify] = useState(true);
  const [advancedParsing, setAdvancedParsing] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load profile details");
        setProfile(json);
        if (json.plan) {
          setActivePlan(json.plan.toLowerCase() === "pro" ? "pro" : "free");
        }
        setDisplayName(json.fullName || "");
        setPhone(json.phone || "");
        setAvatarUrl(json.avatarUrl || "");
      } catch (e: any) {
        setErr(e.message ?? "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    setErr(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to upgrade plan");

      setUpgradeSuccess(true);
      setActivePlan("pro");
      if (profile) {
        setProfile({
          ...profile,
          plan: "pro",
          usageLimit: json.usageLimit ?? 5000,
        });
      }
    } catch (e: any) {
      setErr(e.message ?? "Upgrade failed");
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editDraft.trim(),
          phone: phoneDraft.trim(),
          avatarUrl: avatarUrlDraft.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to update profile");

      setDisplayName(editDraft.trim());
      setPhone(phoneDraft.trim());
      setAvatarUrl(avatarUrlDraft.trim());
      setEditOpen(false);
    } catch (e: any) {
      setErr(e.message ?? "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <svg className="h-8 w-8 animate-spin text-zinc-400" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-zinc-400 text-sm">Loading profile and usage metrics...</span>
      </div>
    );
  }

  if (err || !profile) {
    return (
      <div className="rounded-2xl border border-red-900/40 bg-red-950/20 p-6 text-red-200">
        <h3 className="font-semibold text-lg">Error Loading Profile</h3>
        <p className="mt-2 text-sm text-red-300">{err ?? "Could not retrieve user data"}</p>
      </div>
    );
  }

  const initials = displayName 
    ? displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : (profile.email ? profile.email.substring(0, 2).toUpperCase() : "PX");
  const usedPercentage = Math.min(100, (profile.totalResumes / profile.usageLimit) * 100);

  return (
    <div className="space-y-6">
      {/* Profile Header card */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 p-6 shadow-sm dark:shadow-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-800/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl overflow-hidden bg-gradient-to-tr from-violet-600 to-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-900/20 border border-zinc-200/20 dark:border-zinc-800/20">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div>
              {displayName ? (
                <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">{displayName}</h2>
              ) : (
                <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">{profile.email}</h2>
              )}
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-zinc-500 dark:text-zinc-400 font-medium">
                  {profile.email}
                </span>
                {phone && (
                  <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-zinc-500 dark:text-zinc-400 font-medium">
                    {phone}
                  </span>
                )}
                <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-zinc-500 dark:text-zinc-400 font-medium">
                  UID: {profile.email.split('@')[0]}
                </span>
                <span className={`rounded px-2 py-0.5 font-bold uppercase tracking-wide text-[10px] ${
                  activePlan === "pro" 
                    ? "bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50" 
                    : "bg-zinc-200 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300"
                }`}>
                  {activePlan === "pro" ? "Pro Member" : "Free Plan"}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setEditDraft(displayName);
              setPhoneDraft(phone);
              setAvatarUrlDraft(avatarUrl);
              setEditOpen(true);
            }}
            className="self-start sm:self-auto flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/60 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700/60 transition cursor-pointer"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Edit Profile</div>
                <div className="mt-0.5 text-xs text-zinc-500">Update your details and avatar</div>
              </div>
              <button
                onClick={() => setEditOpen(false)}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/40 px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">Display Name</label>
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  placeholder="e.g. Chandan Kumar"
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-2.5 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-violet-400 dark:focus:border-violet-600 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">Phone Number</label>
                <input
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  placeholder="e.g. +1 (555) 000-0000"
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-2.5 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-violet-400 dark:focus:border-violet-600 transition"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">Avatar Preset Choice</label>
                <div className="flex gap-2.5 mb-2 overflow-x-auto py-1">
                  {[
                    `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.email.split('@')[0]}`,
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.email.split('@')[0]}`,
                    `https://api.dicebear.com/7.x/identicon/svg?seed=${profile.email.split('@')[0]}`,
                    `https://api.dicebear.com/7.x/adventurer/svg?seed=${profile.email.split('@')[0]}`,
                    `https://api.dicebear.com/7.x/initials/svg?seed=${editDraft || 'PX'}`
                  ].map((presetUrl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAvatarUrlDraft(presetUrl)}
                      className={`h-9 w-9 rounded-xl overflow-hidden border-2 transition-all hover:scale-105 cursor-pointer ${
                        avatarUrlDraft === presetUrl ? 'border-violet-500 scale-105 shadow-md' : 'border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      <img src={presetUrl} alt="Preset" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">Custom Image URL</label>
                <input
                  value={avatarUrlDraft}
                  onChange={(e) => setAvatarUrlDraft(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-2.5 text-sm outline-none text-zinc-900 dark:text-zinc-100 focus:border-violet-400 dark:focus:border-violet-600 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">Email</label>
                <input
                  value={profile.email}
                  disabled
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/30 px-4 py-2.5 text-sm text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                />
                <p className="mt-1 text-[11px] text-zinc-400">Email cannot be changed here.</p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                disabled={saving}
                onClick={() => setEditOpen(false)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/40 py-2.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={handleSaveProfile}
                className="flex-1 rounded-xl bg-zinc-900 dark:bg-zinc-100 py-2.5 text-xs font-semibold text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 transition cursor-pointer"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Statistics and Usage Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/20 p-5 shadow-sm dark:shadow-none transition-all hover:scale-[1.01]">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Active Campaigns</div>
          <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">{profile.campaignCount}</div>
          <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Active campaigns</div>
        </div>
        
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/20 p-5 shadow-sm dark:shadow-none transition-all hover:scale-[1.01]">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Resumes Processed</div>
          <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">
            {activePlan === "pro" ? profile.totalResumes : `${profile.totalResumes} / ${profile.usageLimit}`}
          </div>
          <div className="mt-1.5 w-full bg-zinc-200 dark:bg-zinc-950/60 rounded-full h-1.5 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                activePlan === "pro" ? "bg-gradient-to-r from-violet-50 to-indigo-50 w-full" : "bg-zinc-400 dark:bg-zinc-300"
              }`}
              style={{ width: activePlan === "pro" ? "100%" : `${usedPercentage}%` }}
            />
          </div>
          <div className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">Total uploads across workspace</div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/20 p-5 shadow-sm dark:shadow-none transition-all hover:scale-[1.01]">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Candidate Directory</div>
          <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">
            {profile.uniqueCandidatesCount}
          </div>
          <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            {profile.directoryOnlyCount} directory-only uploads
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/20 p-5 shadow-sm dark:shadow-none transition-all hover:scale-[1.01]">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Current Plan</div>
          <div className="mt-2 text-3xl font-bold text-zinc-900 dark:bg-gradient-to-r dark:from-white dark:to-zinc-400 dark:bg-clip-text dark:text-transparent">
            {activePlan === "pro" ? "Pro Plan" : "Free Tier"}
          </div>
          <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            {activePlan === "pro" ? "Unlimited access" : "50 resume limits"}
          </div>
        </div>
      </div>

      {/* Subscription Pricing Tiers */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/10 p-6 space-y-4 shadow-sm dark:shadow-none">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Subscription & Limits</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage your workspace tier and select plans suited for your hiring campaigns.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Free Card */}
          <div className={`relative rounded-xl border p-5 transition-all duration-300 ${
            activePlan === "free"
              ? "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 shadow-inner"
              : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/25 opacity-70 hover:opacity-90"
          }`}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-white text-base">Free Starter</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Perfect for trial and parsing individual resumes.</p>
              </div>
              {activePlan === "free" && (
                <span className="rounded bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700">
                  Active
                </span>
              )}
            </div>
            <div className="mt-4 text-2xl font-bold text-zinc-900 dark:text-white">$0 <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">/ forever</span></div>
            <ul className="mt-4 space-y-2 text-xs text-zinc-500 dark:text-zinc-400">
              <li className="flex items-center gap-1.5">✓ Up to 50 resumes parsed</li>
              <li className="flex items-center gap-1.5">✓ Standard GPT-4o Mini parsing</li>
              <li className="flex items-center gap-1.5">✓ Basic Candidate Scoring</li>
            </ul>
          </div>

          {/* Pro Card */}
          <div className={`relative overflow-hidden rounded-xl border p-5 transition-all duration-300 ${
            activePlan === "pro"
              ? "border-violet-300 dark:border-violet-800 bg-violet-50/20 dark:bg-violet-950/20 shadow-lg"
              : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/25 hover:border-violet-400 dark:hover:border-zinc-700"
          }`}>
            <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-violet-600/10 to-indigo-600/10 rounded-full blur-xl pointer-events-none" />
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-white text-base flex items-center gap-1.5">
                  Pro Recruiter
                  <span className="rounded-full bg-violet-100 dark:bg-violet-900/60 px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase text-violet-600 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50">
                    Popular
                  </span>
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">For recruiters looking to run unlimited campaigns.</p>
              </div>
              {activePlan === "pro" && (
                <span className="rounded bg-violet-200 dark:bg-violet-900/80 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-200 border border-violet-300 dark:border-violet-800">
                  Active
                </span>
              )}
            </div>
            <div className="mt-4 text-2xl font-bold text-zinc-900 dark:text-white">$19 <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">/ month</span></div>
            <ul className="mt-4 space-y-2 text-xs text-zinc-600 dark:text-zinc-400 font-medium">
              <li className="flex items-center gap-1.5 text-violet-600 dark:text-violet-300">✓ Unlimited resume parses</li>
              <li className="flex items-center gap-1.5">✓ Advanced GPT-4o deep evaluation</li>
              <li className="flex items-center gap-1.5">✓ Staggered bulk imports & faster indexing</li>
              <li className="flex items-center gap-1.5">✓ Priority direct recruiter support</li>
            </ul>

            {activePlan !== "pro" && (
              <button
                type="button"
                onClick={handleUpgrade}
                disabled={isUpgrading}
                className="mt-5 w-full rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 py-2.5 text-xs font-semibold text-white shadow-md transition disabled:opacity-60 cursor-pointer"
              >
                {isUpgrading ? "Processing upgrade..." : "Upgrade to Pro"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Preferences Settings */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/10 p-6 space-y-4 shadow-sm dark:shadow-none">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Workspace Preferences</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Configure global defaults for candidate evaluation.</p>
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-900">
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Email Notifications</div>
              <div className="text-xs text-zinc-500">Send confirmation reports after bulk parsing imports finish.</div>
            </div>
            <button
              onClick={() => setEmailNotify(!emailNotify)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 cursor-pointer ${
                emailNotify ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-800"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                  emailNotify ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Deep AI Analysis</div>
              <div className="text-xs text-zinc-500">Utilize advanced semantic parsing models for candidate evaluation.</div>
            </div>
            <button
              onClick={() => setAdvancedParsing(!advancedParsing)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 cursor-pointer ${
                advancedParsing ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-800"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                  advancedParsing ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-200 font-medium">Onboarding Tour</div>
              <div className="text-xs text-zinc-500">Re-run the interactive onboarding walkthrough guide.</div>
            </div>
            <button
              onClick={props.onStartTour}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/30 px-4 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-900/60 transition cursor-pointer"
            >
              Start Tour
            </button>
          </div>
        </div>
      </div>

      {/* Upgrade Success Modal */}
      {upgradeSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-6 animate-fade-in">
          <div className="absolute inset-0 bg-black/80" onClick={() => setUpgradeSuccess(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-violet-800 bg-zinc-950 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-900/30 text-violet-400">
              🏆
            </div>
            <h3 className="mt-4 text-lg font-bold text-white">Upgrade Successful!</h3>
            <p className="mt-2 text-xs text-zinc-400">
              Welcome to the Pro Recruiter Tier. Your limits are removed, and advanced semantic queries are enabled.
            </p>
            <button
              onClick={() => setUpgradeSuccess(false)}
              className="mt-6 w-full rounded-xl bg-zinc-100 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-white transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OnboardingTourModal(props: {
  open: boolean;
  step: number;
  steps: Array<{
    title: string;
    description: string;
    icon: string;
    gradient: string;
    shadow: string;
    badge: string;
    targetId: string | null;
  }>;
  isModalOpen?: boolean;
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

  const current = props.steps[props.step];

  useEffect(() => {
    if (!props.open) return;

    const updatePosition = () => {
      const stepConfig = props.steps[props.step];
      if (!stepConfig) return;
      const el = stepConfig.targetId ? document.getElementById(stepConfig.targetId) : null;

      if (el) {
        const rect = el.getBoundingClientRect();
        const scrollY = window.scrollY;
        const scrollX = window.scrollX;

        // Highlight coordinates
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

        // Determine placement: above or below
        const spaceAbove = rect.top;
        const placement = spaceAbove > 260 ? "above" : "below";

        const tooltipWidth = 380;
        const screenWidth = window.innerWidth;
        
        // Center the tooltip horizontally with respect to the target element, keeping it within screen bounds
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

        // Smooth scroll element into view if not visible
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });

        setCoords({
          highlight: highlightStyle,
          tooltip: tooltipStyle,
          placement,
        });
      } else {
        // Fallback to center screen
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
  }, [props.step, props.open, props.steps]);

  if (!props.open || !current) return null;

  return (
    <>
      {/* Semi-transparent overlay backdrop */}
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-[1px] z-[110] transition-opacity duration-300 ${props.isModalOpen ? 'pointer-events-none opacity-30' : ''}`} 
        onClick={props.onClose} 
      />

      {/* Target element highlight border */}
      <div
        className="rounded-xl border-2 border-violet-500 ring-4 ring-violet-500/20 shadow-[0_0_25px_rgba(139,92,246,0.4)] bg-violet-500/5 transition-all duration-300 animate-pulse pointer-events-none"
        style={coords.highlight}
      />

      {/* Tooltip Card */}
      <div
        className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl transition-all duration-300 select-none text-zinc-100"
        style={coords.tooltip}
      >
        {/* Tooltip Arrow */}
        {coords.placement === "above" && (
          <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-4 h-4 bg-zinc-950 border-r border-b border-zinc-800 rotate-45 animate-fade-in" />
        )}
        {coords.placement === "below" && (
          <div className="absolute left-1/2 -top-2 -translate-x-1/2 w-4 h-4 bg-zinc-950 border-l border-t border-zinc-800 rotate-45 animate-fade-in" />
        )}

        {/* Step Badge */}
        <div className="relative z-10 flex justify-between items-center">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
            Patternix Tour
          </span>
          <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-400 border border-zinc-800/80">
            {current.badge}
          </span>
        </div>

        {/* Header content */}
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

        {/* Progress & Actions */}
        <div className="relative z-10 mt-5 flex items-center justify-between gap-3 pt-3 border-t border-zinc-900">
          <div className="flex gap-1">
            {props.steps.map((_, i) => (
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
              {props.step === props.steps.length - 1 ? "Finish" : "Next"}
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
