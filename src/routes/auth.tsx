import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

type Search = { redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s['redirect'] === "string" ? (s['redirect'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Login or Create Account — Jamshedpurwala" },
      {
        name: "description",
        content: "Sign in to Jamshedpurwala to track orders, save addresses and check out faster.",
      },
      { property: "og:title", content: "Login or Create Account — Jamshedpurwala" },
      { property: "og:description", content: "Secure login for Jamshedpurwala shoppers." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate({ to: redirect ?? "/account", replace: true });
  }, [user, redirect, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
        toast.success("Logged in");
      } else {
        await signUp(email.trim(), password, fullName.trim(), phone.trim());
        setNotice("Account created. If email confirmation is required, check your inbox to confirm.");
        toast.success("Account created");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[440px] px-4 pb-16 pt-4 md:pt-10">
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <ArrowLeft size={14} /> Back to shopping
      </Link>

      <div className="card-surface p-4">
        <h1 className="text-[19px] font-extrabold tracking-tight text-foreground">
          {mode === "login" ? "Login to your account" : "Create your account"}
        </h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {mode === "login"
            ? "Track orders, save addresses and check out quicker."
            : "Join Jamshedpurwala in a few seconds."}
        </p>

        <form onSubmit={submit} className="mt-4 space-y-2.5">
          {mode === "signup" && (
            <>
              <Field label="Full name" value={fullName} onChange={setFullName} required />
              <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
            </>
          )}
          <Field label="Email" value={email} onChange={setEmail} type="email" required />
          <Field label="Password" value={password} onChange={setPassword} type="password" required />

          <button
            type="submit"
            disabled={busy}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-strong text-[14px] font-bold text-primary-foreground disabled:opacity-60"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {mode === "login" ? "Login" : "Create Account"}
          </button>
        </form>

        {notice && (
          <p className="mt-3 rounded-lg bg-primary-soft px-3 py-2 text-[11.5px] text-foreground">{notice}</p>
        )}

        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-4 w-full text-[12.5px] text-muted-foreground"
        >
          {mode === "login" ? (
            <>
              New here? <span className="font-semibold text-primary">Create an account</span>
            </>
          ) : (
            <>
              Already registered? <span className="font-semibold text-primary">Login</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-[13.5px] text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}
