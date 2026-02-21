"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.trim().length >= 6 && !loading;
  }, [email, password, loading]);

  async function handleAuth() {
    setMsg(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Account created. Please sign in.");
        setMode("signin");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      window.location.href = "/dashboard";
    } catch (e: any) {
      setMsg(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setMsg(null);
    if (!email.trim()) {
      setMsg("Enter your email first.");
      return;
    }
    setLoading(true);
    try {
      // Note: requires Auth URL config redirect to a reset page later.
      // Keeping it simple: this still sends email if Supabase is configured.
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      setMsg("Password reset email sent (if the account exists).");
    } catch (e: any) {
      setMsg(e?.message ?? "Could not send reset email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100">
      {/* subtle gradient */}
      <div className="pointer-events-none fixed inset-0 opacity-60">
        <div className="absolute -top-24 left-1/2 h-72 w-[48rem] -translate-x-1/2 rounded-full bg-zinc-800 blur-3xl" />
        <div className="absolute bottom-[-120px] left-10 h-72 w-72 rounded-full bg-zinc-800 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-6 shadow-2xl backdrop-blur">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Resume ATS</h1>
                <p className="mt-1 text-sm text-zinc-400">
                  {mode === "signin" ? "Sign in to your workspace" : "Create your account"}
                </p>
              </div>
              <div className="rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1 text-xs text-zinc-300">
                {mode === "signin" ? "Login" : "Sign up"}
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-200">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm outline-none ring-0 placeholder:text-zinc-600 focus:border-zinc-600"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-200">Password</label>
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-2 focus-within:border-zinc-600">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  type={showPw ? "text" : "password"}
                  className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-zinc-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>

              {mode === "signin" && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Forgot password?
                </button>
              )}
            </div>

            {msg && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-200">
                {msg}
              </div>
            )}

            <button
              type="button"
              onClick={handleAuth}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>

            {/* Toggle */}
            <div className="flex items-center justify-center gap-2 pt-2 text-sm text-zinc-400">
              {mode === "signin" ? (
                <>
                  <span>Don't have an account?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMsg(null);
                      setMode("signup");
                    }}
                    className="font-semibold text-zinc-200 hover:text-white"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  <span>Already have an account?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMsg(null);
                      setMode("signin");
                    }}
                    className="font-semibold text-zinc-200 hover:text-white"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Footer hint */}
          <div className="mt-6 border-t border-zinc-800/70 pt-4 text-xs text-zinc-500">
            By continuing, you agree to store resumes securely in your private workspace.
          </div>
        </div>
      </div>
    </div>
  );
}
