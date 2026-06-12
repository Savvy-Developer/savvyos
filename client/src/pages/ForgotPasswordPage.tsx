import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const forgotMut = trpc.auth.forgotPassword.useMutation({
    onSuccess: () => setSubmitted(true),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    forgotMut.mutate({ email: email.trim(), origin: window.location.origin });
  };

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
            <CardTitle className="text-xl font-semibold text-white text-center">Reset your password</CardTitle>
            <CardDescription className="text-slate-400 text-center text-sm">
              Enter your email and we'll send you a reset link
            </CardDescription>
          </CardHeader>

          <CardContent>
            {submitted ? (
              <div className="text-center space-y-4 py-2">
                <CheckCircle2 className="h-12 w-12 text-cyan-400 mx-auto" />
                <p className="text-white font-medium">Check your email</p>
                <p className="text-slate-400 text-sm">
                  If an account exists for <strong className="text-slate-300">{email}</strong>, you'll receive a password reset link within a few minutes.
                </p>
                <Link href="/login">
                  <Button variant="outline" className="mt-2 border-slate-700 text-slate-300 hover:bg-slate-800">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to sign in
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {forgotMut.error && (
                  <Alert variant="destructive" className="border-red-800 bg-red-950/50">
                    <AlertDescription className="text-red-300 text-sm">{forgotMut.error.message}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-slate-300 text-sm">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@savvy.realty"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={forgotMut.isPending}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-cyan-500 h-10"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold"
                  disabled={forgotMut.isPending || !email}
                >
                  {forgotMut.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </Button>

                <div className="text-center">
                  <Link href="/login" className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors inline-flex items-center gap-1">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to sign in
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
