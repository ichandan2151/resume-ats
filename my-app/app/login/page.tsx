"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const passwordsMatch = useMemo(() => {
    if (mode === "signin") return true;
    if (!confirmPassword) return true;
    return password === confirmPassword;
  }, [mode, password, confirmPassword]);

  const canSubmit = useMemo(() => {
    const isEmailValid = email.trim().length > 3;
    const isPasswordValid = password.trim().length >= 6;
    if (!isEmailValid || !isPasswordValid || loading) return false;
    if (mode === "signup") {
      return password === confirmPassword && confirmPassword.length >= 6;
    }
    return true;
  }, [mode, email, password, confirmPassword, loading]);

  async function handleAuth() {
    setMsg(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const redirectTo = `${window.location.origin}/auth/callback`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo,
          },
        });
        if (error) throw error;
        setMsg("Verification email sent. Please check your inbox.");
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
    <div className="min-h-screen w-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-700">
      {/* floating theme switcher */}
      <div className="fixed top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      {/* subtle dynamic gradient aura */}
      <div className="pointer-events-none fixed inset-0 opacity-60 transition-all duration-700">
        <div className={`absolute -top-24 left-1/2 h-72 w-[48rem] -translate-x-1/2 rounded-full blur-3xl transition-colors duration-700 ${
          mode === "signin" ? "bg-zinc-300 dark:bg-zinc-800/80" : "bg-violet-300/40 dark:bg-violet-900/50"
        }`} />
        <div className={`absolute bottom-[-120px] left-10 h-72 w-72 rounded-full blur-3xl transition-colors duration-700 ${
          mode === "signin" ? "bg-zinc-300/30 dark:bg-zinc-800/40" : "bg-indigo-300/40 dark:bg-indigo-900/50"
        }`} />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
        <div className={`w-full max-w-md rounded-2xl border bg-white/70 dark:bg-zinc-900/40 p-6 shadow-2xl backdrop-blur transition-all duration-500 ${
          mode === "signin"
            ? "border-zinc-200 dark:border-zinc-800/70 shadow-zinc-200/40 dark:shadow-zinc-950/40"
            : "border-violet-200 dark:border-indigo-900/40 shadow-violet-100/40 dark:shadow-indigo-950/40"
        }`}>
          {/* Brand & Toggle Header */}
          <div className="mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-zinc-800 dark:from-white via-zinc-600 dark:via-zinc-200 to-zinc-500 dark:to-zinc-400 bg-clip-text text-transparent">
                  Patternix
                </h1>
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 min-h-[32px] max-w-[280px]">
                  {mode === "signin"
                    ? "Welcome back. Access your workspace and manage candidate profiles."
                    : "Create a new workspace to upload, parse, and score candidate resumes."}
                </p>
              </div>
              <div className={`rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase transition-all duration-300 ${
                mode === "signin"
                  ? "border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950/60 text-zinc-700 dark:text-zinc-300"
                  : "border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300"
              }`}>
                {mode === "signin" ? "Login" : "Register"}
              </div>
            </div>

            {/* Custom Tab Switcher */}
            <div className="flex rounded-xl bg-zinc-100 dark:bg-zinc-950/60 p-1 border border-zinc-200 dark:border-zinc-800/60">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setMsg(null);
                }}
                className={`w-1/2 rounded-lg py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
                  mode === "signin"
                    ? "bg-white dark:bg-zinc-100 text-zinc-950 shadow-md"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setMsg(null);
                }}
                className={`w-1/2 rounded-lg py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
                  mode === "signup"
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                Sign Up
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">Email Address</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                className={`w-full rounded-xl border bg-zinc-50 dark:bg-zinc-950/60 px-4 py-3 text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-700 text-zinc-900 dark:text-zinc-100 transition-all duration-300 ${
                  mode === "signin"
                    ? "border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-500"
                    : "border-zinc-200 dark:border-zinc-800/80 focus:border-indigo-500"
                }`}
                required
              />
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">Password</label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className={`flex items-center gap-2 rounded-xl border bg-zinc-50 dark:bg-zinc-950/60 px-4 py-2 transition-all duration-300 ${
                mode === "signin"
                  ? "border-zinc-200 dark:border-zinc-800 focus-within:border-zinc-450 dark:focus-within:border-zinc-500"
                  : "border-zinc-200 dark:border-zinc-800/80 focus-within:border-indigo-500"
              }`}>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signin" ? "Enter your password" : "Minimum 6 characters"}
                  type={showPw ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-700 text-zinc-900 dark:text-zinc-100"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Confirm Password Field (Only on Sign Up) */}
            {mode === "signup" && (
              <div className="space-y-1.5 animate-fade-in">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">Confirm Password</label>
                <div className={`flex items-center gap-2 rounded-xl border bg-zinc-50 dark:bg-zinc-950/60 px-4 py-2 transition-all duration-300 ${
                  !passwordsMatch
                    ? "border-red-500/50 focus-within:border-red-500"
                    : "border-zinc-200 dark:border-zinc-800/80 focus-within:border-indigo-500"
                }`}>
                  <input
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Verify your password"
                    type={showConfirmPw ? "text" : "password"}
                    autoComplete="new-password"
                    className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-700 text-zinc-900 dark:text-zinc-100"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw((v) => !v)}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {showConfirmPw ? "Hide" : "Show"}
                  </button>
                </div>
                {!passwordsMatch && (
                  <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                )}
              </div>
            )}

            {/* Status Messages */}
            {msg && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-xs text-zinc-200 animate-fade-in">
                {msg}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="button"
              onClick={handleAuth}
              disabled={!canSubmit}
              className={`w-full rounded-xl py-3 text-sm font-semibold transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                mode === "signin"
                  ? "bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-zinc-50 dark:text-zinc-950 shadow-lg shadow-zinc-950/20"
                  : "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-indigo-900/30"
              }`}
            >
              {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
            </button>

            {/* Toggle Switch Hint at Bottom */}
            <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-zinc-500 dark:text-zinc-550">
              {mode === "signin" ? (
                <>
                  <span>New to Patternix?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMsg(null);
                      setMode("signup");
                    }}
                    className="font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  <span>Already have a workspace?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMsg(null);
                      setMode("signin");
                    }}
                    className="font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  >
                    Sign in instead
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Footer hint */}
          <div className="mt-6 border-t border-zinc-200 dark:border-zinc-800/70 pt-4 text-[10px] text-zinc-500 dark:text-zinc-600 text-center uppercase tracking-wider">
            Private & Secure Sandboxed Workspace
          </div>
        </div>
      </div>
    </div>
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
