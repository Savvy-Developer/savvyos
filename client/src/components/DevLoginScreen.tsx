import { trpc } from "@/lib/trpc";

export default function DevLoginScreen() {
  const utils = trpc.useUtils();
  const devLogin = trpc.auth.devLogin.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
    },
  });

  const roles = [
    { value: "admin" as const, label: "Admin Portal", desc: "Brokerage-wide view", cls: "bg-amber-500 hover:bg-amber-600" },
    { value: "isa" as const, label: "ISA Portal", desc: "Lead management & assignment", cls: "bg-purple-500 hover:bg-purple-600" },
    { value: "agent" as const, label: "Agent Portal", desc: "Personal pipeline & deals", cls: "bg-blue-500 hover:bg-blue-600" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 p-8">
        <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center">
          <span className="text-white font-bold text-xl">S</span>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">SavvyOS</h1>
          <p className="text-sm text-muted-foreground mt-1">Select a role to enter dev mode</p>
        </div>
        <div className="flex flex-col gap-3 w-64">
          {roles.map((role) => (
            <button
              key={role.value}
              onClick={() => devLogin.mutate({ role: role.value })}
              disabled={devLogin.isPending}
              className={`${role.cls} text-white rounded-xl px-5 py-3.5 text-left transition-all disabled:opacity-50`}
            >
              <p className="font-semibold text-sm">{role.label}</p>
              <p className="text-xs text-white/70 mt-0.5">{role.desc}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground/50">Dev mode — no authentication required</p>
      </div>
    </div>
  );
}
