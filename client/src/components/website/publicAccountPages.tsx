import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Building2,
  Globe2,
  LayoutDashboard,
  BedDouble,
  Check,
  CircleDot,
  Eye,
  FileText,
  Heart,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Settings,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { publicPath, safeNextPath } from "@/lib/publicSitePaths";
import {
  isEmptySearch,
  normalizeSearchCriteria,
  searchSignature,
  type WebsiteSearchCriteria,
  type WebsiteSearchSource,
  type WebsiteShareChannel,
  type WebsiteShareTarget,
} from "@shared/websiteSearchShareActivity";

/**
 * Investor accounts on the public website.
 *
 * These are the visible half of the accounts built in the previous change: the
 * sign up and sign in pages, password reset, and the four pages an investor
 * gets once they are in. They are separate from SavvyOS staff login and share
 * nothing with it, which is why none of this touches the staff session.
 *
 * Every component here renders a page body only. The public site wraps them in
 * its own header and footer, which keeps this module from importing the site
 * and the site from importing itself back.
 */

const CYAN = "#10c0df";
const NAVY = "#05314a";

export const accountPath = {
  signIn: publicPath("/sign-in"),
  signUp: publicPath("/sign-up"),
  forgot: publicPath("/forgot-password"),
  reset: publicPath("/reset-password"),
  confirmEmail: publicPath("/confirm-email"),
  saved: publicPath("/account/saved"),
  preferences: publicPath("/account/preferences"),
  history: publicPath("/account/history"),
  transactions: publicPath("/account/transactions"),
};

const money = (value: unknown) =>
  value == null || value === ""
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(Number(value));

/** The signed-in investor, or null. Cheap enough to call on every page. */
export function useWebsiteAccount() {
  return trpc.websiteAccount.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });
}

/** Send someone to sign in and bring them back to where they were. */
export function goToSignIn(next?: string) {
  const target = next ?? window.location.pathname + window.location.search;
  window.location.href = `${accountPath.signIn}?next=${encodeURIComponent(target)}`;
}

function currentNext() {
  return safeNextPath(
    new URLSearchParams(window.location.search).get("next")
  );
}

// ─── Small shared pieces ─────────────────────────────────────────────────────

function Field({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none focus:border-cyan-500"
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  );
}

function SubmitButton({
  pending,
  disabled,
  children,
}: {
  pending: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="mt-5 flex w-full items-center justify-center rounded-lg px-4 py-3 font-bold text-[#03293c] disabled:opacity-50"
      style={{ backgroundColor: CYAN }}
    >
      {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}

function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="bg-slate-50 py-16">
      <div className="mx-auto max-w-md px-4 sm:px-6">
        <div className="rounded-2xl border bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-black" style={{ color: NAVY }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
          )}
          {children}
        </div>
        {footer && (
          <div className="mt-5 text-center text-sm text-slate-600">{footer}</div>
        )}
      </div>
    </section>
  );
}

/**
 * What stands in for a figure an investor has not signed in to see.
 *
 * Says plainly what is behind it rather than teasing a blurred number, because
 * a visitor deciding whether an account is worth it deserves to know what they
 * are trading an email address for.
 */
export function LockedPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center shadow-sm">
      <Lock className="mx-auto h-6 w-6 text-slate-400" />
      <h2 className="mt-3 text-xl font-bold" style={{ color: NAVY }}>
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        {description}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button
          onClick={() => goToSignIn()}
          className="rounded-lg px-5 py-2.5 text-sm font-bold text-[#03293c]"
          style={{ backgroundColor: CYAN }}
        >
          Sign in
        </button>
        <a
          href={`${accountPath.signUp}?next=${encodeURIComponent(window.location.pathname)}`}
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-bold"
          style={{ color: NAVY }}
        >
          Create a free account
        </a>
      </div>
    </div>
  );
}

/**
 * One panel for everything on a property page that needs an account, instead
 * of a separate locked box (each with its own sign-in buttons) for every
 * section. A visitor sees in one place what a free account unlocks.
 */
export function LockedGroupPanel({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-white to-cyan-50/60 p-7 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-100">
          <Lock className="h-5 w-5 text-cyan-700" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold" style={{ color: NAVY }}>
            See the full investment analysis
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Free for investors. Create an account to unlock:
          </p>
        </div>
      </div>
      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {items.map(item => (
          <li key={item} className="flex items-start gap-2 rounded-lg bg-white/80 px-3 py-2.5 text-sm font-medium text-slate-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href={`${accountPath.signUp}?next=${encodeURIComponent(window.location.pathname)}`}
          className="rounded-lg px-5 py-2.5 text-sm font-bold text-[#03293c]"
          style={{ backgroundColor: CYAN }}
        >
          Create a free account
        </a>
        <button
          onClick={() => goToSignIn()}
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold"
          style={{ color: NAVY }}
        >
          Sign in
        </button>
      </div>
    </div>
  );
}

// ─── Sign up, sign in, password reset ────────────────────────────────────────

export function SignUpBody() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    // Spam trap, the same one the contact forms use: hidden from people,
    // filled by bots that fill every input. The server refuses a filled one.
    website: "",
  });
  const set = (key: string, value: string) =>
    setForm(prior => ({ ...prior, [key]: value }));
  const signUp = trpc.websiteAccount.signUp.useMutation({
    onSuccess: () => {
      window.location.href = currentNext();
    },
    onError: error => toast.error(error.message),
  });
  const ready = form.email.trim() !== "" && form.password !== "";
  return (
    <AuthCard
      title="Create your account"
      subtitle="Free. Unlocks projected revenue, returns, occupancy and the comparable listings behind every analysis."
      footer={
        <>
          Already have an account?{" "}
          <a className="font-bold text-cyan-600" href={accountPath.signIn}>
            Sign in
          </a>
        </>
      }
    >
      <form
        className="mt-6 space-y-4"
        onSubmit={event => {
          event.preventDefault();
          if (!ready) return;
          signUp.mutate({
            email: form.email.trim(),
            password: form.password,
            firstName: form.firstName.trim() || undefined,
            lastName: form.lastName.trim() || undefined,
            phone: form.phone.trim() || undefined,
            website: form.website || undefined,
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="First name"
            value={form.firstName}
            onChange={value => set("firstName", value)}
            autoComplete="given-name"
          />
          <Field
            label="Last name"
            value={form.lastName}
            onChange={value => set("lastName", value)}
            autoComplete="family-name"
          />
        </div>
        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={value => set("email", value)}
          autoComplete="email"
        />
        <Field
          label="Phone (optional)"
          value={form.phone}
          onChange={value => set("phone", value)}
          autoComplete="tel"
        />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={value => set("password", value)}
          autoComplete="new-password"
        />
        <p className="text-xs text-slate-500">
          At least 10 characters. Avoid anything you use elsewhere.
        </p>
        <input
          aria-hidden="true"
          tabIndex={-1}
          autoComplete="off"
          name="website"
          className="hidden"
          value={form.website}
          onChange={event => set("website", event.target.value)}
        />
        <SubmitButton pending={signUp.isPending} disabled={!ready}>
          Create account
        </SubmitButton>
      </form>
    </AuthCard>
  );
}

export function SignInBody() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = trpc.websiteAccount.signIn.useMutation({
    // Investors and staff both stay on the website. Staff get their own menu
    // in the header, with links that open SavvyOS already signed in.
    onSuccess: () => {
      window.location.href = currentNext();
    },
    onError: error => toast.error(error.message),
  });
  return (
    <AuthCard
      title="Sign in"
      subtitle="Investors and Savvy team members. Team members can use their SavvyOS login."
      footer={
        <>
          New here?{" "}
          <a className="font-bold text-cyan-600" href={accountPath.signUp}>
            Create a free account
          </a>
        </>
      }
    >
      <form
        className="mt-6 space-y-4"
        onSubmit={event => {
          event.preventDefault();
          if (!email.trim() || !password) return;
          signIn.mutate({ email: email.trim(), password });
        }}
      >
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <div className="text-right">
          <a className="text-sm font-semibold text-cyan-600" href={accountPath.forgot}>
            Forgot your password?
          </a>
        </div>
        <SubmitButton
          pending={signIn.isPending}
          disabled={!email.trim() || !password}
        >
          Sign in
        </SubmitButton>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordBody() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const request = trpc.websiteAccount.requestPasswordReset.useMutation({
    onSuccess: () => setSent(true),
    onError: error => toast.error(error.message),
  });
  if (sent) {
    return (
      <AuthCard
        title="Check your email"
        subtitle="If that email has an account, a reset link is on its way. The link is good for a short window, so use it soon."
        footer={
          <a className="font-bold text-cyan-600" href={accountPath.signIn}>
            Back to sign in
          </a>
        }
      >
        <div />
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter the email on your account and we will send a link to set a new password."
      footer={
        <a className="font-bold text-cyan-600" href={accountPath.signIn}>
          Back to sign in
        </a>
      }
    >
      <form
        className="mt-6 space-y-4"
        onSubmit={event => {
          event.preventDefault();
          if (!email.trim()) return;
          request.mutate({ email: email.trim() });
        }}
      >
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />
        <SubmitButton pending={request.isPending} disabled={!email.trim()}>
          Send reset link
        </SubmitButton>
      </form>
    </AuthCard>
  );
}

export function ResetPasswordBody() {
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token") || "",
    []
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const reset = trpc.websiteAccount.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Your password is set. You are signed in.");
      window.location.href = publicPath();
    },
    onError: error => toast.error(error.message),
  });

  if (!token) {
    return (
      <AuthCard
        title="That link is not complete"
        subtitle="Open the link from your email again, or ask for a new one."
        footer={
          <a className="font-bold text-cyan-600" href={accountPath.forgot}>
            Request a new link
          </a>
        }
      >
        <div />
      </AuthCard>
    );
  }

  const mismatch = confirm !== "" && confirm !== password;
  return (
    <AuthCard title="Set a new password">
      <form
        className="mt-6 space-y-4"
        onSubmit={event => {
          event.preventDefault();
          if (!password || mismatch) return;
          reset.mutate({ token, password });
        }}
      >
        <Field
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <Field
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {mismatch && (
          <p className="text-sm font-semibold text-rose-600">
            Those two do not match.
          </p>
        )}
        <p className="text-xs text-slate-500">At least 10 characters.</p>
        <SubmitButton
          pending={reset.isPending}
          disabled={!password || mismatch}
        >
          Set password and sign in
        </SubmitButton>
      </form>
    </AuthCard>
  );
}

/**
 * Where the link in the sign-up confirmation email lands. The token is spent
 * by the page, not by the GET, so a mail scanner opening the link does not
 * use it up.
 */
export function ConfirmEmailBody() {
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token") || "",
    []
  );
  const account = useWebsiteAccount();
  const started = useRef(false);
  const confirm = trpc.websiteAccount.confirmEmail.useMutation();
  const resend = trpc.websiteAccount.resendEmailConfirmation.useMutation({
    onSuccess: result => {
      if (result.sent) toast.success("A new link is on its way. Check your email.");
      else if (result.reason === "confirmed") toast.success("Your email is already confirmed.");
      else toast.error("Email confirmation is not available right now.");
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    confirm.mutate({ token });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const home = (
    <a className="font-bold text-cyan-600" href={publicPath()}>
      Go to the homepage
    </a>
  );

  if (!token) {
    return (
      <AuthCard
        title="That link is not complete"
        subtitle="Open the link from your confirmation email again."
        footer={home}
      >
        <div />
      </AuthCard>
    );
  }
  if (confirm.isSuccess) {
    return (
      <AuthCard
        title="Your email is confirmed"
        subtitle={
          confirm.data.alreadyConfirmed
            ? "This email was already confirmed. You are all set."
            : "Thanks. You will now get new properties and market updates from Savvy STR Agents."
        }
        footer={home}
      >
        <div />
      </AuthCard>
    );
  }
  if (confirm.isError) {
    return (
      <AuthCard
        title="We could not confirm your email"
        subtitle={confirm.error.message}
        footer={
          account.data ? (
            home
          ) : (
            <a className="font-bold text-cyan-600" href={`${accountPath.signIn}?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}>
              Sign in to get a new link
            </a>
          )
        }
      >
        {account.data ? (
          <form
            className="mt-6"
            onSubmit={event => {
              event.preventDefault();
              resend.mutate();
            }}
          >
            <SubmitButton pending={resend.isPending}>Send me a new link</SubmitButton>
          </form>
        ) : (
          <div />
        )}
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Confirming your email" subtitle="One moment.">
      <div className="mt-6 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
      </div>
    </AuthCard>
  );
}

// ─── Header account control ──────────────────────────────────────────────────

/** The Savvy staff member signed in on the website, or null. */
export function useWebsiteStaff() {
  return trpc.websiteAccount.staffMe.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });
}

const STAFF_MENU_ICONS: Record<string, React.ElementType> = {
  properties: Building2,
  caseStudies: FileText,
  blog: BookOpen,
  profile: UserRound,
  websiteStudio: Globe2,
  dashboard: LayoutDashboard,
};

/**
 * Open a SavvyOS page for the signed-in staff member, already signed in.
 *
 * The tab is opened inside the click, before the network call, because
 * browsers block a tab opened after one. The one-time link is then loaded
 * into it; if the browser refused the tab anyway, the current tab goes.
 */
function useOpenInSavvyOS() {
  const open = trpc.websiteAccount.staffOpen.useMutation();
  return (target: string) => {
    const tab = window.open("", "_blank");
    if (tab) {
      try {
        tab.opener = null;
        tab.document.title = "Opening SavvyOS…";
      } catch {
        /* cross-origin once it navigates; nothing to do */
      }
    }
    open
      .mutateAsync({ target: target as any })
      .then(({ url }) => {
        if (tab && !tab.closed) tab.location.href = url;
        else window.location.href = url;
      })
      .catch(error => {
        if (tab && !tab.closed) tab.close();
        toast.error(error?.message || "Could not open SavvyOS. Please sign in again.");
      });
  };
}

function staffInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0))
      .join("")
      .toUpperCase() || "S"
  );
}

function StaffAvatar({ name, imageUrl, size = 32 }: { name: string; imageUrl: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  return imageUrl && !broken ? (
    <img
      src={imageUrl}
      alt=""
      style={style}
      onError={() => setBroken(true)}
      className="rounded-full object-cover object-[center_20%] ring-2 ring-[#10c0df]"
    />
  ) : (
    <span
      style={style}
      className="flex items-center justify-center rounded-full bg-[#05314a] text-xs font-medium text-white ring-2 ring-[#10c0df]"
    >
      {staffInitials(name)}
    </span>
  );
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  agent: "Agent",
  isa: "ISA",
  agent_support: "Agent support",
};

function StaffMenu({ staff, onSignOut }: { staff: any; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const openInSavvyOS = useOpenInSavvyOS();
  const itemClass =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(value => !value)}
        aria-label="Your Savvy account"
        className="flex items-center rounded-full p-0.5 transition-colors hover:ring-2 hover:ring-[#10c0df]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10c0df]"
      >
        <StaffAvatar name={staff.name} imageUrl={staff.imageUrl} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border bg-white p-2 shadow-xl">
          <div className="flex items-center gap-3 border-b px-3 pb-3 pt-2">
            <StaffAvatar name={staff.name} imageUrl={staff.imageUrl} size={40} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-[#05314a]">{staff.name}</div>
              <div className="text-xs text-slate-500">Savvy team · {ROLE_LABELS[staff.role] || staff.role}</div>
            </div>
          </div>
          <div className="py-1">
            {staff.profileSlug ? (
              <a className={itemClass} href={publicPath(`/agents/${staff.profileSlug}`)}>
                <Eye className="h-4 w-4" /> View my public profile
              </a>
            ) : null}
            {(staff.menu || []).map((item: { key: string; label: string }) => {
              const Icon = STAFF_MENU_ICONS[item.key] || ArrowRight;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={itemClass}
                  onClick={() => {
                    setOpen(false);
                    openInSavvyOS(item.key);
                  }}
                >
                  <Icon className="h-4 w-4" /> {item.label}
                </button>
              );
            })}
          </div>
          <div className="border-t pt-1">
            <button className={itemClass} onClick={onSignOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
          <p className="px-3 pb-1 pt-2 text-[11px] leading-4 text-slate-400">SavvyOS pages open in a new tab, already signed in.</p>
        </div>
      )}
    </div>
  );
}

export function AccountMenu({ dark = false }: { dark?: boolean }) {
  const account = useWebsiteAccount();
  const staff = useWebsiteStaff();
  const utils = trpc.useUtils();
  const signOut = trpc.websiteAccount.signOut.useMutation({
    onSuccess: async () => {
      await utils.websiteAccount.invalidate();
      window.location.href = publicPath();
    },
  });
  const [open, setOpen] = useState(false);

  if (account.isLoading || staff.isLoading) return null;
  if (staff.data) return <StaffMenu staff={staff.data} onSignOut={() => signOut.mutate()} />;

  // Login and Sign Up, then an initials avatar once signed in: the same as
  // the live savvy-agents.com header.
  if (!account.data) {
    const next = `?next=${encodeURIComponent(window.location.pathname)}`;
    return (
      <div className="flex items-center gap-3">
        <a
          className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors ${dark ? "text-white hover:bg-white/10" : "text-gray-700 hover:bg-[#05314a]/5 hover:text-[#05314a]"}`}
          href={`${accountPath.signIn}${next}`}
        >
          Login
        </a>
        <a
          className="inline-flex h-8 items-center rounded-md bg-[#10c0df] px-3 text-sm font-medium text-white transition-colors hover:bg-[#10c0df]/90"
          href={`${accountPath.signUp}${next}`}
        >
          Sign Up
        </a>
      </div>
    );
  }

  const initials =
    [account.data.firstName, account.data.lastName]
      .map(part => (part || "").trim().charAt(0))
      .join("")
      .toUpperCase() ||
    account.data.email.charAt(0).toUpperCase();
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(value => !value)}
        aria-label="Your account"
        className="flex items-center rounded-full p-0.5 transition-colors hover:ring-2 hover:ring-[#10c0df]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10c0df]"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-[#05314a] text-xs font-medium text-white">
          {initials}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border bg-white p-2 shadow-xl">
          <a
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            href={accountPath.saved}
          >
            <Heart className="h-4 w-4" /> Saved properties
          </a>
          <a
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            href={accountPath.transactions}
          >
            <FileText className="h-4 w-4" /> My transactions
          </a>
          <a
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            href={accountPath.preferences}
          >
            <Settings className="h-4 w-4" /> Email preferences
          </a>
          <a
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            href={accountPath.history}
          >
            <Eye className="h-4 w-4" /> Recently viewed
          </a>
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => signOut.mutate()}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** The same links as the header menu, for the mobile navigation drawer. */
export function AccountMobileLinks({ dark = false }: { dark?: boolean }) {
  const account = useWebsiteAccount();
  const staff = useWebsiteStaff();
  const openInSavvyOS = useOpenInSavvyOS();
  const utils = trpc.useUtils();
  const signOut = trpc.websiteAccount.signOut.useMutation({
    onSuccess: async () => {
      await utils.websiteAccount.invalidate();
      window.location.href = publicPath();
    },
  });
  const itemClass = `block rounded-lg px-3 py-3 text-sm font-semibold ${dark ? "text-white hover:bg-white/10" : "text-[#05314a] hover:bg-slate-50"}`;
  if (account.isLoading || staff.isLoading) return null;
  if (staff.data) {
    return (
      <>
        <div className="flex items-center gap-3 px-3 py-2">
          <StaffAvatar name={staff.data.name} imageUrl={staff.data.imageUrl} size={36} />
          <div className="min-w-0">
            <div className={`truncate text-sm font-bold ${dark ? "text-white" : "text-[#05314a]"}`}>{staff.data.name}</div>
            <div className={`text-xs ${dark ? "text-white/70" : "text-slate-500"}`}>
              Savvy team · {ROLE_LABELS[staff.data.role] || staff.data.role}
            </div>
          </div>
        </div>
        {staff.data.profileSlug ? (
          <a className={itemClass} href={publicPath(`/agents/${staff.data.profileSlug}`)}>
            View my public profile
          </a>
        ) : null}
        {(staff.data.menu || []).map((item: { key: string; label: string }) => (
          <button key={item.key} type="button" className={`w-full text-left ${itemClass}`} onClick={() => openInSavvyOS(item.key)}>
            {item.label}
          </button>
        ))}
        <button className={`w-full text-left ${itemClass}`} onClick={() => signOut.mutate()}>
          Sign out
        </button>
      </>
    );
  }
  if (!account.data) {
    return (
      <>
        <a className={itemClass} href={accountPath.signIn}>
          Login
        </a>
        <a
          className="mt-2 block rounded-md bg-[#10c0df] px-3 py-3 text-center text-sm font-medium text-white hover:bg-[#10c0df]/90"
          href={accountPath.signUp}
        >
          Sign Up
        </a>
      </>
    );
  }
  return (
    <>
      <a className={itemClass} href={accountPath.saved}>
        Saved properties
      </a>
      <a className={itemClass} href={accountPath.transactions}>
        My transactions
      </a>
      <a className={itemClass} href={accountPath.preferences}>
        Email preferences
      </a>
      <a className={itemClass} href={accountPath.history}>
        Recently viewed
      </a>
      <button
        className={`w-full text-left ${itemClass}`}
        onClick={() => signOut.mutate()}
      >
        Sign out
      </button>
    </>
  );
}

// ─── Save button ─────────────────────────────────────────────────────────────

/**
 * Save a listing, or prompt for an account first.
 *
 * The saved set is read once for the whole page rather than per card, so a
 * grid of twenty listings makes one request rather than twenty.
 */
export function SaveButton({
  propertyId,
  compact = false,
  pill = false,
}: {
  propertyId: number | null | undefined;
  compact?: boolean;
  /** The rounded "Save" button in the property page's top bar. */
  pill?: boolean;
}) {
  const account = useWebsiteAccount();
  const staff = useWebsiteStaff();
  const utils = trpc.useUtils();
  const saved = trpc.websiteAccount.savedProperties.useQuery(undefined, {
    enabled: !!account.data,
    staleTime: 30_000,
  });
  const setSaved = trpc.websiteAccount.setSaved.useMutation({
    onSuccess: () => utils.websiteAccount.savedProperties.invalidate(),
    onError: error => toast.error(error.message),
  });

  // Saving is an investor feature. A signed-in team member without an
  // investor account would only be bounced to the sign-in page.
  if (!propertyId || (staff.data && !account.data)) return null;
  const isSaved = (saved.data || []).some(
    (row: any) => row.propertyId === propertyId
  );

  const onClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!account.data) return goToSignIn();
    setSaved.mutate({ propertyId, saved: !isSaved });
  };

  if (pill) {
    return (
      <button
        onClick={onClick}
        aria-label={isSaved ? "Remove from saved" : "Save property"}
        aria-pressed={isSaved}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e5e5] px-3 py-1.5 text-sm font-medium text-[#05314a] transition-all duration-200 hover:scale-105 hover:text-[#10c0df]"
      >
        <Heart className={`h-4 w-4 transition-colors ${isSaved ? "fill-red-500 text-red-500" : ""}`} />
        <span className="hidden sm:inline">{isSaved ? "Saved" : "Save"}</span>
      </button>
    );
  }

  if (compact) {
    return (
      <button
        onClick={onClick}
        aria-label={isSaved ? "Remove from saved" : "Save this property"}
        aria-pressed={isSaved}
        className="flex size-9 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm transition-colors hover:bg-white"
      >
        <Heart
          className={`h-4 w-4 ${isSaved ? "fill-red-500 text-red-500" : "text-[#0a0a0a]/70"}`}
        />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      aria-pressed={isSaved}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold"
      style={{ color: NAVY }}
    >
      <Heart
        className={`h-4 w-4 ${isSaved ? "fill-rose-500 text-rose-500" : ""}`}
      />
      {isSaved ? "Saved" : "Save this property"}
    </button>
  );
}

/** Record that a signed-in investor looked at this listing. */
export function useRecordPropertyView(propertyId: number | null | undefined) {
  const account = useWebsiteAccount();
  const record = trpc.websiteAccount.recordView.useMutation();
  const signedIn = !!account.data;
  const mutate = record.mutate;
  useEffect(() => {
    if (!signedIn || !propertyId) return;
    mutate({ propertyId });
    // Once per listing per visit. Re-firing on every render would turn the
    // view count into a render count.
  }, [signedIn, propertyId, mutate]);
}

/**
 * How long a search has to stand before it counts. Filters change in one
 * click, but the search box changes per keystroke; a search the visitor has
 * stopped changing for this long is the one they meant.
 */
export const COMMITTED_SEARCH_MS = 2000;

const sessionSeen = new Set<string>();
const SESSION_KEY = "savvy:searchActivity";

/**
 * True the first time `key` is seen in this browser session, and remembers it.
 * Session storage keeps a reload from logging the same search again; the
 * in-memory set covers a browser that refuses storage.
 */
export function firstThisSession(key: string): boolean {
  if (sessionSeen.has(key)) return false;
  let stored: string[] = [];
  try {
    stored = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "[]");
    if (!Array.isArray(stored)) stored = [];
  } catch {
    stored = [];
  }
  if (stored.includes(key)) {
    sessionSeen.add(key);
    return false;
  }
  sessionSeen.add(key);
  try {
    // The last hundred is plenty for one visit and keeps the entry small.
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify([...stored, key].slice(-100)));
  } catch {
    // Storage refused: the in-memory set still holds for this page.
  }
  return true;
}

/**
 * Put a signed-in investor's search on their contact timeline, as the old site
 * did. Fires once the search has stood for COMMITTED_SEARCH_MS, and at most
 * once per identical search per session. Anonymous visitors send nothing.
 * Pass null while the page does not yet know what was searched.
 */
export function useRecordSearch(
  criteria: WebsiteSearchCriteria | null,
  source: WebsiteSearchSource,
  delayMs: number = COMMITTED_SEARCH_MS
) {
  const account = useWebsiteAccount();
  const record = trpc.websiteAccount.recordSearch.useMutation();
  const signedIn = !!account.data;
  const mutate = record.mutate;
  const signature = criteria && !isEmptySearch(criteria) ? searchSignature(criteria, source) : null;
  const latest = useRef(criteria);
  latest.current = criteria;
  useEffect(() => {
    if (!signedIn || !signature) return;
    const timer = window.setTimeout(() => {
      const current = latest.current;
      if (!current || !firstThisSession(`search:${signature}`)) return;
      const n = normalizeSearchCriteria(current);
      mutate({
        source,
        query: n.query ?? undefined,
        marketId: n.marketId ?? undefined,
        state: n.state ?? undefined,
        propertyType: n.propertyType ?? undefined,
        minBeds: n.minBeds ?? undefined,
        minBaths: n.minBaths ?? undefined,
        minPrice: n.minPrice ?? undefined,
        maxPrice: n.maxPrice ?? undefined,
      });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [signedIn, signature, source, delayMs, mutate]);
}

/**
 * A function that puts a signed-in investor's share on their contact
 * timeline. Does nothing for an anonymous visitor or a missing target.
 */
export function useRecordShare() {
  const account = useWebsiteAccount();
  const record = trpc.websiteAccount.recordShare.useMutation();
  const signedIn = !!account.data;
  const mutate = record.mutate;
  return useCallback(
    (target: WebsiteShareTarget | null | undefined, channel: WebsiteShareChannel) => {
      if (!signedIn || !target) return;
      const id = target.kind === "property" ? target.propertyId : target.contentId;
      if (!id) return;
      mutate({ target, channel });
    },
    [signedIn, mutate]
  );
}

// ─── Account pages ───────────────────────────────────────────────────────────

function RequireAccount({ children }: { children: React.ReactNode }) {
  const account = useWebsiteAccount();
  useEffect(() => {
    if (!account.isLoading && !account.data) goToSignIn();
  }, [account.isLoading, account.data]);
  if (account.isLoading || !account.data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  return <>{children}</>;
}

type AccountTab = "saved" | "preferences" | "history" | "transactions";

function AccountTabs({ active }: { active: AccountTab }) {
  const tabs: Array<[string, string, typeof Heart]> = [
    ["saved", accountPath.saved, Heart],
    ["transactions", accountPath.transactions, FileText],
    ["preferences", accountPath.preferences, Mail],
    ["history", accountPath.history, Eye],
  ];
  const label: Record<string, string> = {
    saved: "Saved properties",
    transactions: "My transactions",
    preferences: "Email preferences",
    history: "Recently viewed",
  };
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map(([key, href, Icon]) => (
        <a
          key={key}
          href={href}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${
            key === active
              ? "bg-[#05314a] text-white"
              : "border border-slate-300 bg-white text-slate-700"
          }`}
        >
          <Icon className="h-4 w-4" />
          {label[key]}
        </a>
      ))}
    </div>
  );
}

function AccountShell({
  title,
  active,
  children,
}: {
  title: string;
  active: AccountTab;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-slate-50 py-12">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-black" style={{ color: NAVY }}>
          {title}
        </h1>
        <div className="mt-6">
          <AccountTabs active={active} />
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function EmptyState({ message, cta }: { message: string; cta?: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <p className="text-sm text-slate-500">{message}</p>
      {cta && (
        <a
          className="mt-5 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-[#03293c]"
          style={{ backgroundColor: CYAN }}
          href={publicPath("/properties")}
        >
          Browse properties <ArrowRight className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

function ListingRow({
  row,
  meta,
  action,
}: {
  row: any;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center">
      <a
        href={publicPath(`/properties/${encodeURIComponent(row.slug)}`)}
        className="shrink-0"
      >
        {row.heroImageUrl ? (
          <img
            src={row.heroImageUrl}
            alt={row.address || row.headline || "Property"}
            className="h-28 w-full rounded-xl object-cover sm:w-44"
          />
        ) : (
          <div className="h-28 w-full rounded-xl bg-slate-100 sm:w-44" />
        )}
      </a>
      <div className="min-w-0 flex-1">
        <a href={publicPath(`/properties/${encodeURIComponent(row.slug)}`)}>
          <h2 className="truncate text-lg font-bold" style={{ color: NAVY }}>
            {row.headline || row.address}
          </h2>
        </a>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
          <MapPin className="h-3.5 w-3.5" />
          {[row.city, row.state].filter(Boolean).join(", ") || "Location on request"}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <span className="font-bold" style={{ color: NAVY }}>
            {money(row.listPrice)}
          </span>
          {row.beds && (
            <span className="flex items-center gap-1">
              <BedDouble className="h-4 w-4 text-cyan-600" />
              {row.beds}
            </span>
          )}
          {meta}
        </div>
      </div>
      {action && <div className="sm:w-44">{action}</div>}
    </div>
  );
}

export function SavedPropertiesBody() {
  return (
    <RequireAccount>
      <AccountShell title="Saved properties" active="saved">
        <SavedList />
      </AccountShell>
    </RequireAccount>
  );
}

function SavedList() {
  const saved = trpc.websiteAccount.savedProperties.useQuery();
  if (saved.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  const rows = saved.data || [];
  if (!rows.length) {
    return (
      <EmptyState
        message="Nothing saved yet. Tap the heart on any listing and it will wait for you here."
        cta
      />
    );
  }
  return (
    <div className="space-y-4">
      {rows.map((row: any) => (
        <ListingRow
          key={row.propertyId}
          row={row}
          action={<SaveButton propertyId={row.propertyId} />}
        />
      ))}
      <p className="text-xs text-slate-500">
        A listing that comes off the market drops off this list. It comes back
        if it is published again.
      </p>
    </div>
  );
}

export function ViewHistoryBody() {
  return (
    <RequireAccount>
      <AccountShell title="Recently viewed" active="history">
        <HistoryList />
      </AccountShell>
    </RequireAccount>
  );
}

function HistoryList() {
  const history = trpc.websiteAccount.viewHistory.useQuery({ limit: 50 });
  if (history.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  const rows = history.data || [];
  if (!rows.length) {
    return <EmptyState message="Properties you open will show up here." cta />;
  }
  return (
    <div className="space-y-4">
      {rows.map((row: any) => (
        <ListingRow
          key={row.propertyId}
          row={row}
          meta={
            <span className="text-slate-500">
              Viewed {row.viewCount > 1 ? `${row.viewCount} times` : "once"}
            </span>
          }
          action={<SaveButton propertyId={row.propertyId} />}
        />
      ))}
    </div>
  );
}

export function EmailPreferencesBody() {
  return (
    <RequireAccount>
      <AccountShell title="Email preferences" active="preferences">
        <PreferencesForm />
      </AccountShell>
    </RequireAccount>
  );
}

const numberOrNull = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

function PreferencesForm() {
  const preferences = trpc.websiteAccount.preferences.useQuery();
  const markets = trpc.website.publicMarkets.useQuery();
  const utils = trpc.useUtils();
  const save = trpc.websiteAccount.savePreferences.useMutation({
    onSuccess: () => {
      toast.success("Preferences saved.");
      utils.websiteAccount.preferences.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const [form, setForm] = useState({
    notificationsEnabled: true,
    emailFrequency: "daily" as "daily" | "weekly" | "never",
    budgetMin: "",
    budgetMax: "",
    minBedrooms: "",
    marketProfileIds: [] as number[],
  });
  const [loaded, setLoaded] = useState(false);

  const row: any = preferences.data;
  useEffect(() => {
    if (loaded || preferences.isLoading) return;
    if (row) {
      setForm({
        notificationsEnabled: row.notificationsEnabled ?? true,
        emailFrequency: row.emailFrequency ?? "daily",
        budgetMin: row.budgetMin == null ? "" : String(Number(row.budgetMin)),
        budgetMax: row.budgetMax == null ? "" : String(Number(row.budgetMax)),
        minBedrooms: row.minBedrooms == null ? "" : String(row.minBedrooms),
        marketProfileIds: Array.isArray(row.marketProfileIds)
          ? row.marketProfileIds
          : [],
      });
    }
    setLoaded(true);
  }, [loaded, preferences.isLoading, row]);

  if (preferences.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const toggleMarket = (id: number) =>
    setForm(prior => ({
      ...prior,
      marketProfileIds: prior.marketProfileIds.includes(id)
        ? prior.marketProfileIds.filter(value => value !== id)
        : prior.marketProfileIds.concat(id),
    }));

  const min = numberOrNull(form.budgetMin);
  const max = numberOrNull(form.budgetMax);
  const reversed = min != null && max != null && min > max;

  return (
    <form
      className="space-y-6"
      onSubmit={event => {
        event.preventDefault();
        if (reversed) return;
        save.mutate({
          notificationsEnabled: form.notificationsEnabled,
          emailFrequency: form.emailFrequency,
          budgetMin: min,
          budgetMax: max,
          minBedrooms: numberOrNull(form.minBedrooms),
          marketProfileIds: form.marketProfileIds,
        });
      }}
    >
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold" style={{ color: NAVY }}>
          New property emails
        </h2>
        <label className="mt-4 flex items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={form.notificationsEnabled}
            onChange={event =>
              setForm(prior => ({
                ...prior,
                notificationsEnabled: event.target.checked,
              }))
            }
          />
          <span className="text-sm font-semibold text-slate-700">
            Email me new properties that match what I am looking for
          </span>
        </label>
        <div className="mt-5 max-w-xs">
          <span className="text-sm font-semibold text-slate-700">How often</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-sm"
            value={form.emailFrequency}
            disabled={!form.notificationsEnabled}
            onChange={event =>
              setForm(prior => ({
                ...prior,
                emailFrequency: event.target.value as any,
              }))
            }
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="never">Never</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold" style={{ color: NAVY }}>
          What to send
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Leave anything blank to hear about everything.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field
            label="Budget from"
            value={form.budgetMin}
            onChange={value => setForm(prior => ({ ...prior, budgetMin: value }))}
            placeholder="400,000"
          />
          <Field
            label="Budget to"
            value={form.budgetMax}
            onChange={value => setForm(prior => ({ ...prior, budgetMax: value }))}
            placeholder="900,000"
          />
          <Field
            label="Bedrooms, minimum"
            value={form.minBedrooms}
            onChange={value =>
              setForm(prior => ({ ...prior, minBedrooms: value }))
            }
            placeholder="3"
          />
        </div>
        {reversed && (
          <p className="mt-3 text-sm font-semibold text-rose-600">
            The lower budget is above the higher one.
          </p>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold" style={{ color: NAVY }}>
          Markets
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Pick the markets you want to hear about. None selected means all of
          them.
        </p>
        {markets.isLoading ? (
          <Loader2 className="mt-4 h-5 w-5 animate-spin text-slate-400" />
        ) : (markets.data || []).length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No markets are open for subscription yet.
          </p>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(markets.data || []).map((market: any) => (
              <label
                key={market.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.marketProfileIds.includes(market.id)}
                  onChange={() => toggleMarket(market.id)}
                />
                <span className="text-sm font-semibold text-slate-700">
                  {market.name}
                  {market.state ? `, ${market.state}` : ""}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={save.isPending || reversed}
        className="flex items-center justify-center rounded-lg px-6 py-3 font-bold text-[#03293c] disabled:opacity-50"
        style={{ backgroundColor: CYAN }}
      >
        {save.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          "Save preferences"
        )}
      </button>
    </form>
  );
}

// ─── My transactions ─────────────────────────────────────────────────────────

const shortDate = (value: unknown) => {
  if (!value) return null;
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

/**
 * The three points of a purchase, drawn plainly.
 *
 * No percentage complete and no invented intermediate stages. SavvyOS records
 * a contract date, a closing date and a status, so that is what this shows.
 * A progress bar reading "60%" would be a number nobody computed.
 */
function StepTrack({ steps }: { steps: any[] }) {
  return (
    <ol className="mt-5 space-y-3">
      {steps.map((step: any) => {
        const done = step.state === "done";
        const current = step.state === "current";
        const stopped = step.state === "stopped";
        return (
          <li key={step.key} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                stopped
                  ? "bg-slate-200 text-slate-600"
                  : done
                    ? "bg-[#10c0df] text-[#03293c]"
                    : current
                      ? "border-2 border-[#10c0df] bg-white text-cyan-600"
                      : "border border-slate-300 bg-white text-slate-300"
              }`}
            >
              {stopped ? (
                <XCircle className="h-3.5 w-3.5" />
              ) : done ? (
                <Check className="h-3.5 w-3.5" />
              ) : current ? (
                <CircleDot className="h-3.5 w-3.5" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              )}
            </span>
            <div className="min-w-0">
              <p
                className={`text-sm font-bold ${
                  done || current || stopped ? "text-[#05314a]" : "text-slate-400"
                }`}
              >
                {step.label}
              </p>
              {shortDate(step.date) && (
                <p className="text-xs text-slate-500">{shortDate(step.date)}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TransactionCard({ deal }: { deal: any }) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-cyan-600">
            {deal.side === "sale" ? "Sale" : "Purchase"}
          </p>
          <h2 className="mt-1 text-xl font-bold" style={{ color: NAVY }}>
            {deal.propertyAddress || "Property on file"}
          </h2>
        </div>
        <div className="text-right">
          <span
            className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${
              deal.status === "closed"
                ? "bg-emerald-50 text-emerald-800"
                : deal.status === "terminated"
                  ? "bg-slate-100 text-slate-600"
                  : "bg-cyan-50 text-cyan-900"
            }`}
          >
            {deal.statusLabel}
          </span>
          {deal.purchasePrice && (
            <p className="mt-2 text-lg font-black" style={{ color: NAVY }}>
              {money(deal.purchasePrice)}
            </p>
          )}
        </div>
      </div>

      <StepTrack steps={deal.steps || []} />

      {deal.agent?.name && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            {deal.agent.imageUrl ? (
              <img
                src={deal.agent.imageUrl}
                alt=""
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100">
                <UserRound className="h-5 w-5 text-cyan-700" />
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                Your agent
              </p>
              <p className="text-sm font-bold" style={{ color: NAVY }}>
                {deal.agent.name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {deal.agent.phone && (
              <a
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                style={{ color: NAVY }}
                href={`tel:${String(deal.agent.phone).replace(/[^+\d]/g, "")}`}
              >
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
            )}
            {deal.agent.email && (
              <a
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                style={{ color: NAVY }}
                href={`mailto:${deal.agent.email}`}
              >
                <Mail className="h-3.5 w-3.5" /> Email
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function MyTransactionsBody() {
  return (
    <RequireAccount>
      <AccountShell title="My transactions" active="transactions">
        <TransactionsList />
      </AccountShell>
    </RequireAccount>
  );
}

function TransactionsList() {
  const deals = trpc.websiteAccount.myTransactions.useQuery();
  if (deals.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  const rows = deals.data || [];
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <FileText className="mx-auto h-6 w-6 text-slate-400" />
        <p className="mt-3 text-sm text-slate-500">
          Nothing here yet. Once you are under contract on a property with a
          Savvy agent, you will be able to follow it from this page.
        </p>
        <p className="mx-auto mt-2 max-w-md text-xs text-slate-400">
          Already working with an agent? Ask them to connect your account and it
          will show up.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {rows.map((deal: any) => (
        <TransactionCard key={deal.id} deal={deal} />
      ))}
      <p className="text-xs text-slate-500">
        Dates reflect what is on file with your agent and can move. Your agent
        is the best person to ask about anything on this page.
      </p>
    </div>
  );
}
