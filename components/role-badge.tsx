import { Mic, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { RoleType } from "@/lib/supabase/types";

const LABELS: Record<RoleType, { label: string; icon: typeof Mic }> = {
  on_air: { label: "On Air", icon: Mic },
  crew: { label: "Back of House", icon: Wrench },
};

export function RoleBadge({ role }: { role: RoleType }) {
  const { label, icon: Icon } = LABELS[role];
  return (
    <Badge
      variant={role === "on_air" ? "default" : "secondary"}
      className="font-normal"
    >
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}

export function RoleBadgeGroup({ roles }: { roles: RoleType[] }) {
  if (!roles.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((r) => (
        <RoleBadge key={r} role={r} />
      ))}
    </div>
  );
}
