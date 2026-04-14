import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildAmazonUrl } from "@/lib/amazon";

export function AmazonLink({
  asin,
  size = "sm",
  variant = "outline",
  label = "View on Amazon",
}: {
  asin: string | null | undefined;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary" | "ghost";
  label?: string;
}) {
  const url = buildAmazonUrl(asin);
  if (!url) {
    return (
      <Button size={size} variant="ghost" disabled className="text-xs">
        Affiliate link pending
      </Button>
    );
  }
  return (
    <Button asChild size={size} variant={variant}>
      <a href={url} target="_blank" rel="noopener noreferrer sponsored">
        {label}
        <ExternalLink className="size-3.5" />
      </a>
    </Button>
  );
}
