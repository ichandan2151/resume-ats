"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type ScheduleData = {
  id: string;
  candidate_name: string | null;
  candidate_email: string;
  available_slots: string[];
  selected_slot: string | null;
  status: string;
  interview_type: string;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  job_title: string | null;
  created_at: string;
};

export default function SchedulePage() {
  const params = useParams();
  const token = params.token as string;

  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [icsContent, setIcsContent] = useState<string | null>(null);

  useEffect(() => {
    fetchSchedule();
  }, [token]);

  const fetchSchedule = async () => {
    try {
      const res = await fetch(`/api/schedule/${token}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Not found");
      setSchedule(json.data);
      if (json.data.status === "booked") {
        setBooked(true);
        setSelectedSlot(json.data.selected_slot);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async () => {
    if (!selectedSlot) return;
    setBooking(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedule/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedSlot }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to book");
      setBooked(true);
      if (json.ics) setIcsContent(json.ics);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBooking(false);
    }
  };

  const downloadICS = () => {
    if (!icsContent) return;
    const blob = new Blob([icsContent], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "interview.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !schedule) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-zinc-800 mb-2">Link Not Found</h1>
          <p className="text-sm text-zinc-500">This scheduling link is invalid or has expired. Please contact the recruiter for a new link.</p>
        </div>
      </div>
    );
  }

  if (!schedule) return null;

  const formatSlot = (iso: string) => {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      time: d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      full: d.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    };
  };

  // Group slots by date
  const slotsByDate: Record<string, string[]> = {};
  for (const slot of schedule.available_slots) {
    const dateKey = new Date(slot).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    if (!slotsByDate[dateKey]) slotsByDate[dateKey] = [];
    slotsByDate[dateKey].push(slot);
  }

  if (schedule.status === "cancelled") {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-zinc-800 mb-2">Interview Cancelled</h1>
          <p className="text-sm text-zinc-500">This interview has been cancelled. Please contact the recruiter for more information.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-600 to-violet-800 text-white">
        <div className="max-w-lg mx-auto px-6 py-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white/80">Patternix</span>
          </div>
          <h1 className="text-2xl font-bold mb-1">
            {booked ? "Interview Confirmed!" : "Schedule Your Interview"}
          </h1>
          {schedule.job_title && (
            <p className="text-violet-200 text-sm mt-1">{schedule.job_title}</p>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 -mt-4">
        {/* Interview details card */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 mb-4">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Interview Details</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <div className="text-xs text-zinc-400">Format</div>
                <div className="text-sm font-semibold text-zinc-800">
                  {schedule.interview_type.charAt(0).toUpperCase() + schedule.interview_type.slice(1)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-xs text-zinc-400">Duration</div>
                <div className="text-sm font-semibold text-zinc-800">{schedule.duration_minutes} min</div>
              </div>
            </div>
            {schedule.location && (
              <div className="col-span-2 flex items-center gap-2">
                <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-zinc-400">Location</div>
                  <div className="text-sm font-semibold text-zinc-800">{schedule.location}</div>
                </div>
              </div>
            )}
          </div>

          {schedule.notes && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <div className="text-xs font-semibold text-amber-700 mb-1">Preparation Notes</div>
                  <p className="text-sm text-amber-800 leading-relaxed">{schedule.notes}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Booked confirmation */}
        {booked && selectedSlot && (
          <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 p-5 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-800">You're all set!</h3>
                <p className="text-sm text-zinc-500">A confirmation email with a calendar invite has been sent</p>
              </div>
            </div>

            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
              <div className="text-sm font-bold text-emerald-800">
                {formatSlot(selectedSlot).full}
              </div>
              <div className="text-lg font-bold text-emerald-700 mt-1">
                {formatSlot(selectedSlot).time}
              </div>
            </div>

            {icsContent && (
              <button
                onClick={downloadICS}
                className="w-full mt-4 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 py-3 text-sm font-semibold hover:bg-violet-100 transition cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Calendar Invite (.ics)
              </button>
            )}
          </div>
        )}

        {/* Slot selection */}
        {!booked && (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 mb-4">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">Pick a Time</h2>

            <div className="space-y-5">
              {Object.entries(slotsByDate).map(([dateLabel, slots]) => (
                <div key={dateLabel}>
                  <h3 className="text-sm font-semibold text-zinc-700 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {dateLabel}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {slots.map((slot) => {
                      const isSelected = selectedSlot === slot;
                      const timeStr = new Date(slot).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      });
                      return (
                        <button
                          key={slot}
                          onClick={() => setSelectedSlot(slot)}
                          className={`rounded-xl border py-3 px-4 text-sm font-semibold transition cursor-pointer ${
                            isSelected
                              ? "border-violet-500 bg-violet-50 text-violet-700 ring-2 ring-violet-500/20"
                              : "border-zinc-200 bg-white text-zinc-700 hover:border-violet-300 hover:bg-violet-50/50"
                          }`}
                        >
                          {timeStr}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div className="mt-4 text-sm text-red-600 bg-red-50 rounded-xl p-3 border border-red-200">
                {error}
              </div>
            )}

            <button
              onClick={handleBook}
              disabled={!selectedSlot || booking}
              className="w-full mt-5 rounded-xl bg-violet-600 text-white py-3.5 text-sm font-bold hover:bg-violet-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shadow-sm"
            >
              {booking ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Confirming...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Confirm Interview
                </>
              )}
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-zinc-400 pb-8">
          Powered by Patternix
        </p>
      </div>
    </div>
  );
}
