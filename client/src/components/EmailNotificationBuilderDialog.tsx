import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  "Transactions",
  "Listings",
  "Tasks",
  "Leads & CRM",
  "Onboarding",
  "Commission",
  "Projects",
  "Recognition",
  "Reporting",
] as const;

const RECIPIENTS = ["Agent", "Admin", "ISA", "Agent + Admin", "Mentioned User"] as const;

type TriggerType = "Event" | "Scheduled";

export interface CustomNotificationFormValues {
  name: string;
  description: string;
  trigger: string;
  triggerType: TriggerType;
  recipient: (typeof RECIPIENTS)[number];
  category: (typeof CATEGORIES)[number];
  subject: string;
  bodyText: string;
  isEnabled: boolean;
}

interface EmailNotificationBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: CustomNotificationFormValues) => void;
  isSaving: boolean;
}

const initialValues: CustomNotificationFormValues = {
  name: "",
  description: "",
  trigger: "",
  triggerType: "Event",
  recipient: "Agent",
  category: "Leads & CRM",
  subject: "",
  bodyText: "",
  isEnabled: true,
};

export default function EmailNotificationBuilderDialog({
  open,
  onOpenChange,
  onCreate,
  isSaving,
}: EmailNotificationBuilderDialogProps) {
  const [values, setValues] = useState<CustomNotificationFormValues>(initialValues);

  const update = <K extends keyof CustomNotificationFormValues>(key: K, value: CustomNotificationFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const reset = () => setValues(initialValues);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleCreate = () => {
    if (!values.name.trim() || !values.trigger.trim() || !values.subject.trim() || !values.bodyText.trim()) {
      toast.error("Add a name, trigger, subject line, and message before saving.");
      return;
    }

    onCreate({
      ...values,
      name: values.name.trim(),
      description: values.description.trim(),
      trigger: values.trigger.trim(),
      subject: values.subject.trim(),
      bodyText: values.bodyText.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            New Email Notification
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <p className="text-sm text-muted-foreground">
            Define the notification’s audience, trigger, and email copy. This saves a reusable notification type that can be connected to the relevant SavvyOS event or automation.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notification-name">Notification name *</Label>
              <Input
                id="notification-name"
                value={values.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="e.g., New Listing Approval"
                maxLength={160}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notification-description">Description</Label>
              <Input
                id="notification-description"
                value={values.description}
                onChange={(event) => update("description", event.target.value)}
                placeholder="Explain when this communication is useful."
                maxLength={500}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Trigger type</Label>
              <Select value={values.triggerType} onValueChange={(value) => update("triggerType", value as TriggerType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Event">Event-triggered</SelectItem>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notification-trigger">Event or schedule *</Label>
              <Input
                id="notification-trigger"
                value={values.trigger}
                onChange={(event) => update("trigger", event.target.value)}
                placeholder={values.triggerType === "Event" ? "e.g., Listing status becomes approved" : "e.g., Every Monday at 9:00 AM Eastern"}
                maxLength={255}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Recipient</Label>
              <Select value={values.recipient} onValueChange={(value) => update("recipient", value as CustomNotificationFormValues["recipient"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECIPIENTS.map((recipient) => <SelectItem key={recipient} value={recipient}>{recipient}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={values.category} onValueChange={(value) => update("category", value as CustomNotificationFormValues["category"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
            <div>
              <p className="text-sm font-medium">Email content</p>
              <p className="text-xs text-muted-foreground mt-0.5">Use merge tags such as <code className="bg-background px-1 rounded">{"{{contactName}}"}</code> when an automation provides that value.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notification-subject">Subject line *</Label>
              <Input
                id="notification-subject"
                value={values.subject}
                onChange={(event) => update("subject", event.target.value)}
                placeholder="e.g., Your listing is approved"
                maxLength={512}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notification-body">Message *</Label>
              <Textarea
                id="notification-body"
                value={values.bodyText}
                onChange={(event) => update("bodyText", event.target.value)}
                placeholder="Write the notification message."
                className="min-h-36 resize-y"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="notification-enabled" className="text-sm font-medium">Enable after saving</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Turn this off to finish configuration before enabling it.</p>
            </div>
            <Switch
              id="notification-enabled"
              checked={values.isEnabled}
              onCheckedChange={(enabled) => update("isEnabled", enabled)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleCreate} disabled={isSaving}>
            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving notification…</> : "Create notification"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
