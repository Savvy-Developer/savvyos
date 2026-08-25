import { useEffect, useRef, useState } from "react";
import AircallWorkspace from "aircall-everywhere";
import { AlertCircle, CheckCircle2, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";

type AircallWorkspaceInstance = {
  send: (
    eventName: string,
    payload: unknown,
    callback?: (success: boolean, data: unknown) => void
  ) => boolean;
  on: (eventName: string, callback: (value: unknown) => void) => void;
};

type Props = {
  initialPhone?: string | null;
  onCallStarted?: (phone: string) => void;
};

export default function AircallWorkspacePanel({
  initialPhone,
  onCallStarted,
}: Props) {
  const workspaceRef = useRef<AircallWorkspaceInstance | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [dialNumber, setDialNumber] = useState(initialPhone ?? "");
  const [status, setStatus] = useState(
    "Load the Aircall Workspace, then sign in with your Aircall account."
  );

  useEffect(() => {
    setDialNumber(initialPhone ?? "");
  }, [initialPhone]);

  useEffect(() => {
    const workspace = new AircallWorkspace({
      domToLoadWorkspace: "#savvyos-aircall-workspace",
      size: "auto",
      onLogin: () => {
        setIsLoggedIn(true);
        setIsReady(true);
        setStatus(
          "Aircall Workspace is ready. You can call directly from SavvyOS."
        );
      },
      onLogout: () => {
        setIsLoggedIn(false);
        setStatus("Aircall Workspace was signed out.");
      },
    }) as AircallWorkspaceInstance;
    workspaceRef.current = workspace;
    workspace.on("outgoing_call", () => setStatus("Calling through Aircall…"));
    workspace.on("outgoing_answered", () => setStatus("Call connected."));
    workspace.on("call_ended", () =>
      setStatus(
        "Call ended. The result will sync to the Contact activity history."
      )
    );
    return () => {
      workspaceRef.current = null;
      const container = document.querySelector("#savvyos-aircall-workspace");
      if (container) container.innerHTML = "";
    };
  }, []);

  function dial() {
    const phone = dialNumber.trim();
    if (!phone) {
      setStatus("Enter a phone number to dial.");
      return;
    }
    if (!workspaceRef.current || !isReady) {
      setStatus(
        "Wait for Aircall Workspace to finish loading and sign in before dialing."
      );
      return;
    }
    workspaceRef.current.send(
      "dial_number",
      { phone_number: phone },
      (success, data) => {
        if (success) {
          setStatus(`Dialing ${phone} through the embedded Aircall Workspace.`);
          onCallStarted?.(phone);
        } else {
          const detail =
            data && typeof data === "object" && "message" in data
              ? String((data as { message?: unknown }).message)
              : "Aircall did not accept the dial request.";
          setStatus(detail);
        }
      }
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_376px]">
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <PhoneCall className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">Embedded Aircall Dialer</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Make and receive calls without leaving SavvyOS. Aircall still
              handles the phone connection, caller ID, recordings, and call
              controls.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={dialNumber}
            onChange={event => setDialNumber(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") dial();
            }}
            className="h-10 flex-1 rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Enter a number, e.g. +1 555 555 5555"
            aria-label="Phone number to dial"
          />
          <Button onClick={dial} disabled={!isReady}>
            <PhoneCall className="mr-2 h-4 w-4" /> Call
          </Button>
        </div>
        <div
          className={`flex gap-2 rounded-md border px-3 py-2 text-sm ${isLoggedIn ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
        >
          {isLoggedIn ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{status}</span>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div
          id="savvyos-aircall-workspace"
          className="h-[666px] min-h-[600px] w-full"
        />
      </section>
    </div>
  );
}
