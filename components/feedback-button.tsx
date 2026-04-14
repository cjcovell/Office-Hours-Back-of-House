"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type FeedbackType = "bug" | "feature" | "general";

const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature Request" },
];

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("general");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pathname = usePathname();

  async function handleSubmit() {
    if (!message.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message: message.trim(),
          page: pathname,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to submit feedback");
        return;
      }

      toast.success("Thanks for your feedback!");
      setMessage("");
      setType("general");
      setOpen(false);
    } catch {
      toast.error("Failed to submit feedback");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="fixed bottom-6 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-shadow hover:text-foreground hover:shadow-lg"
          aria-label="Send feedback"
        >
          <MessageSquare className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  type === t.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What's on your mind?"
            rows={4}
            maxLength={5000}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!message.trim() || isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
              Submit
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
