import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Eye, EyeOff, Loader2, XCircle } from "lucide-react";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);

  const resetMut = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setDone(true);
      setTimeout(() => navigate("/login"), 3000);
    },
  });

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch || tooShort) return;
    resetMut.mutate({ token, password });
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4">
        <div className="text-center space-y-4">
          <XCircle className="h-12 w-12 text-red-400 mx-auto" />
          <p className="text-white font-medium">Invalid reset link</p>
          <p className="text-slate-400 text-sm">This link is missing a reset token. Please request a new one.</p>
          <Link href="/forgot-password">
            <Button className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold">Request new link</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img src={LOGO_URL} alt="Savvy STR Agents" className="h-10 object-contain" />
        </div>

        <Card className="border-slate-800 bg-slate-900/80 backdrop-blur shadow-2xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-semibold text-white text-center">Set new password</CardTitle>
            <CardDescription className="text-slate-400 text-center text-sm">
              Choose a strong password for your account
            </CardDescription>
          </CardHeader>

          <CardContent>
            {done ? (
              <div className="text-center space-y-4 py-2">
                <CheckCircle2 className="h-12 w-12 text-cyan-400 mx-auto" />
                <p className="text-white font-medium">Password updated!</p>
                <p className="text-slate-400 text-sm">Your password has been changed. Redirecting you to sign in…</p>
                <Link href="/login">
                  <Button className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold">Sign in now</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {resetMut.error && (
                  <Alert variant="destructive" className="border-red-800 bg-red-950/50">
                    <AlertDescription className="text-red-300 text-sm">{resetMut.error.message}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-slate-300 text-sm">New password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={resetMut.isPending}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-cyan-500 h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {tooShort && <p className="text-xs text-red-400">Password must be at least 8 characters</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm" className="text-slate-300 text-sm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Repeat your password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    disabled={resetMut.isPending}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-cyan-500 h-10"
                  />
                  {mismatch && <p className="text-xs text-red-400">Passwords do not match</p>}
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold"
                  disabled={resetMut.isPending || !password || !confirm || mismatch || tooShort}
                >
                  {resetMut.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating…
                    </>
                  ) : (
                    "Update password"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
