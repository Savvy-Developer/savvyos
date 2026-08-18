import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, MessageSquare, Send } from "lucide-react";

type Channel = "email" | "sms";

export default function SmartPlanTestSendDialog({ channel, subject, body, onClose }: { channel: Channel; subject: string; body: string; onClose: () => void }) {
  const [recipient, setRecipient] = useState("");
  const isEmail = channel === "email";
  const testSend = trpc.smartPlans.testSend.useMutation({
    onSuccess: () => {
      toast.success(`Test ${isEmail ? "email" : "text message"} sent successfully`);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = () => {
    const value = recipient.trim();
    if (!value) return toast.error(`Enter a ${isEmail ? "test email address" : "test phone number"}`);
    testSend.mutate({
      channel,
      subject: isEmail ? subject.trim() : null,
      body,
      recipientEmail: isEmail ? value : null,
      recipientPhone: isEmail ? null : value,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{isEmail ? <Mail className="h-5 w-5 text-primary" /> : <MessageSquare className="h-5 w-5 text-primary" />} Send test {isEmail ? "email" : "text"}</DialogTitle>
          <DialogDescription>This sends a single test {isEmail ? "email" : "text message"} only. It will be clearly labeled <strong>[TEST]</strong> and will not enroll or contact your campaign audience.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="test-recipient">{isEmail ? "Test email address" : "Test phone number"}</Label>
          <Input id="test-recipient" autoFocus type={isEmail ? "email" : "tel"} value={recipient} onChange={(event) => setRecipient(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder={isEmail ? "name@example.com" : "(555) 555-5555"} />
          <p className="text-xs text-muted-foreground">{isEmail ? "The subject and merge tags will use the campaign content with example test contact details." : "The text body and merge tags will use the campaign content with example test contact details."}</p>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={testSend.isPending || !recipient.trim()}><Send className="mr-1.5 h-4 w-4" />{testSend.isPending ? "Sending..." : `Send test ${isEmail ? "email" : "text"}`}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
