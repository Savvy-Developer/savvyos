import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="text-center">
        <p className="text-6xl font-bold text-primary mb-2">404</p>
        <h1 className="text-xl font-semibold text-foreground mb-2">Page not found</h1>
        <p className="text-muted-foreground mb-6">The page you're looking for doesn't exist.</p>
        <Button onClick={() => navigate("/")}>Go to Dashboard</Button>
      </div>
    </div>
  );
}
