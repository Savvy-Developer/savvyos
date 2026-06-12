import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { MapPin, ArrowRight } from "lucide-react";

/**
 * MarketsPage — legacy stub.
 * Market management has moved to Market Match Hub.
 * This page redirects users there.
 */
export default function MarketsPage() {
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
      <div className="rounded-full bg-primary/10 p-5">
        <MapPin className="h-10 w-10 text-primary" />
      </div>
      <div className="space-y-2 max-w-md">
        <h1 className="text-2xl font-bold tracking-tight">Markets Moved</h1>
        <p className="text-muted-foreground">
          Market management has been consolidated into the{" "}
          <strong>Market Match Hub</strong>. You can create, edit, and configure
          all markets there — including investor fit profiles, talking points, and
          annual GCI goals.
        </p>
      </div>
      <Button onClick={() => navigate("/market-match-config")}>
        Go to Market Match Hub <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
