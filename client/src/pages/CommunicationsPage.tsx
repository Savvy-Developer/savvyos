import { useEffect } from "react";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openCommunicationsHub } from "@/components/CommunicationsHub";

export default function CommunicationsPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const contactId = Number(params.get("contact") || 0) || undefined;
    const phone = params.get("dial");
    openCommunicationsHub({
      contactId,
      phone,
      tab: phone ? "calls" : "texts",
    });
  }, []);

  return (
    <div className="mx-auto max-w-2xl rounded-xl border bg-card p-8 text-center">
      <MessageSquareText className="mx-auto h-9 w-9 text-primary" />
      <h1 className="mt-4 text-xl font-semibold">Communications Hub</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your persistent calls and texts panel is open on the right. It stays
        available while you navigate SavvyOS.
      </p>
      <Button className="mt-5" onClick={() => openCommunicationsHub()}>
        Open Communications Hub
      </Button>
    </div>
  );
}
