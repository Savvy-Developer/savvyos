import { useAuth } from "@/_core/hooks/useAuth";
import AdminDashboard from "./admin/AdminDashboard";
import ISADashboard from "./isa/ISADashboard";
import AgentDashboard from "./agent/AgentDashboard";

export default function Dashboard() {
  const { user } = useAuth();
  const role = (user as any)?.role as "admin" | "agent" | "isa";

  if (role === "admin") return <AdminDashboard />;
  if (role === "isa") return <ISADashboard />;
  return <AgentDashboard />;
}
