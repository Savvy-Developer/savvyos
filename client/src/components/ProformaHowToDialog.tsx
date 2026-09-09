import { CircleHelp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const PROFORMA_HOW_TO_VIDEO_URL =
  "https://drive.google.com/file/d/13d5kdA9ioLbFI59t7rQ9fMKXzpdKe6MM/preview";

export default function ProformaHowToDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CircleHelp className="mr-1 h-4 w-4" />
          How to use?
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4 pr-12 sm:px-6">
          <DialogTitle>How to use the Pro-forma Tool</DialogTitle>
          <DialogDescription>
            Watch this walkthrough to learn how to create and use a property pro-forma.
          </DialogDescription>
        </DialogHeader>
        <div className="aspect-video w-full bg-black">
          <iframe
            src={PROFORMA_HOW_TO_VIDEO_URL}
            title="How to use the Pro-forma Tool"
            className="h-full w-full border-0"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
