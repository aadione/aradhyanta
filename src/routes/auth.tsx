import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Phone, ShieldCheck, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type Search = { redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Login with Phone OTP — Jamshedpurwala" },
      {
        name: "description",
        content: "Sign in or create your Jamshedpurwala account in seconds with a phone number and OTP.",
      },
      { property: "og:title", content: "Login with Phone OTP — Jamshedpurwala" },
      { property: "og:description", content: "Secure OTP login for shopping across Jamshedpur stores." },
    ],
  }),
  component: AuthPage,
});

const codes = ["+91", "+1", "+44", "+971"];

function friendly(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("expired")) return "This OTP has expired. Please resend a new code.";
  if (m.includes("invalid") || m.includes("token")) return "Invalid OTP. Please check the code and try again.";
  if (m.includes("rate") || m.includes("many")) return "Too many attempts. Please wait a minute and retry.";
  if (m.includes("sms") || m.includes("provider") || m.includes("unsupported"))
    return "Phone sign-in is not available right now. Please try again later.";
  return "Something went wrong. Please try again.";
}

function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { redirect } = Route.useSearch();
  const [code, setCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp" | "done">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const target = redirect && redirect.startsWith("/") ? redirect : "/account";

  useEffect(() => {
    if (user && step !== "otp") navigate({ to: target, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const full = `${code}${phone.replace(/\D/g, "")}`;

  async function sendOtp() {
    setError("");
    if (phone.replace(/\D/g, "").length < 6) {
      setError("Please enter a valid phone number.");
      return;
    }
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithOtp({ phone: full });
    setBusy(false);
    if (e) {
      setError(friendly(e.message));
      return;
    }
    setStep("otp");
    setCooldown(30);
  }

  async function verify() {
    setError("");
    if (otp.replace(/\D/g, "").length < 4) {
      setError("Enter the OTP you received.");
      return;
    }
    setBusy(true);
    const { error: e } = await supabase.auth.verifyOtp({ phone: full, token: otp.trim(), type: "sms" });
    setBusy(false);
    if (e) {
      setError(friendly(e.message));
      return;
    }
    setStep("done");
    setTimeout(() => navigate({ to: target, replace: true }), 700);
  }

  return (
    <div className="mx-auto max-w-[440px] px-4 pb-10 pt-4">
      <button
        onClick={() => navigate({ to: "/" })}
        aria-label="Back"
        className="mb-4 flex h-9 w-9 items-center justify-center rounded-full border border-border"
      >
        <ArrowLeft size={17} className="text-foreground" />
      </button>

      <div className="card-surface p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft">
          <ShieldCheck size={19} className="text-primary" />
        </span>
        <h1 className="mt-3 text-[19px] font-extrabold tracking-tight text-foreground">
          {step === "otp" ? "Verify your number" : "Login or Sign up"}
        </h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {step === "otp"
            ? `We sent a 6-digit code to ${full}`
            : "Enter your phone number, we'll send you a one-time password."}
        </p>

        {step === "done" ? (
          <div className="mt-5 flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-3 text-[13px] font-semibold text-accent-foreground">
            <CheckCircle2 size={18} className="text-primary" /> Verified! Taking you ahead…
          </div>
        ) : step === "phone" ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2">
              <select
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-label="Country code"
                className="h-11 shrink-0 rounded-lg border border-border bg-card px-2 text-[13px] font-semibold text-foreground"
              >
                {codes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border px-3">
                <Phone size={15} className="shrink-0 text-muted-foreground" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 12))}
                  inputMode="numeric"
                  placeholder="Phone number"
                  aria-label="Phone number"
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none"
                />
              </div>
            </div>
            <button
              onClick={sendOtp}
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-strong text-[14px] font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 size={16} className="animate-spin" />} Send OTP
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="Enter OTP"
              aria-label="OTP"
              className="h-11 w-full rounded-lg border border-border px-3 text-center text-[18px] font-bold tracking-[0.4em] text-foreground outline-none"
            />
            <button
              onClick={verify}
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-strong text-[14px] font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 size={16} className="animate-spin" />} Verify OTP
            </button>
            <div className="flex items-center justify-between text-[12px]">
              <button onClick={() => setStep("phone")} className="text-muted-foreground">
                Change number
              </button>
              <button
                onClick={sendOtp}
                disabled={cooldown > 0 || busy}
                className="font-semibold text-primary disabled:text-muted-foreground"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-[12px] font-medium text-destructive">{error}</p>}
      </div>
    </div>
  );
}
