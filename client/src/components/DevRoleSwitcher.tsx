import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const ROLES = [
  { value: "admin" as const, label: "Admin", color: "bg-amber-500 hover:bg-amber-600", active: "ring-2 ring-amber-300" },
  { value: "isa" as const, label: "ISA", color: "bg-purple-500 hover:bg-purple-600", active: "ring-2 ring-purple-300" },
  { value: "agent" as const, label: "Agent", color: "bg-blue-500 hover:bg-blue-600", active: "ring-2 ring-blue-300" },
];

export default function DevRoleSwitcher({ currentRole }: { currentRole?: string }) {
  const [switching, setSwitching] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const devLogin = trpc.auth.devLogin.useMutation({
    onSuccess: async (data) => {
      toast.success(`Switched to ${data.role} view`);
      await utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (e) => {
      toast.error(e.message);
      setSwitching(null);
    },
  });

  return (
    // Use env-safe bottom offset: bottom-[env(safe-area-inset-bottom,0px)+72px] ensures
    // it clears iOS Safari's bottom toolbar (≈72px) plus the safe area inset.
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-1 bg-gray-900/95 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5 shadow-xl"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}
    >
      <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mr-1.5">Dev</span>
      {ROLES.map((role) => {
        const isActive = currentRole === role.value;
        const isLoading = switching === role.value;
        return (
          <button
            key={role.value}
            disabled={isLoading || devLogin.isPending}
            onClick={() => {
              if (isActive) return;
              setSwitching(role.value);
              devLogin.mutate({ role: role.value });
            }}
            className={`
              px-3 py-1.5 rounded-full text-xs font-semibold text-white transition-all
              ${role.color}
              ${isActive ? `opacity-100 ${role.active}` : "opacity-60"}
              ${isLoading ? "opacity-40 cursor-wait" : "cursor-pointer"}
              disabled:cursor-not-allowed
            `}
          >
            {isLoading ? "…" : role.label}
          </button>
        );
      })}
    </div>
  );
}
