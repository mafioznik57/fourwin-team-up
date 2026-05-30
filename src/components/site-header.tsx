import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, User } from "lucide-react";
import { toast } from "sonner";

export function SiteHeader() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  const path = location.pathname;
  const isAuthPage = path === "/login" || path === "/register";

  return (
    <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
      <Link
        to="/"
        className="flex items-center gap-2 font-bold text-xl rounded-lg px-2 py-1 -ml-2 hover:bg-secondary/50 transition"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#ef4444] to-[#3b82f6]" />
        FourWin
      </Link>
      <nav className="flex items-center gap-1">
        <Link
          to="/"
          className={`text-sm transition px-3 py-1.5 rounded-md ${path === "/" ? "text-foreground bg-secondary/60" : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"}`}
        >
          Home
        </Link>
        <Link
          to="/shop"
          className={`text-sm transition px-3 py-1.5 rounded-md ${path === "/shop" ? "text-foreground bg-secondary/60" : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"}`}
        >
          Shop
        </Link>
        {loading ? null : user && profile ? (
          <>
            <Link
              to="/profile"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition ${path === "/profile" ? "bg-secondary/60" : "hover:bg-secondary/40"}`}
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#a855f7] to-[#3b82f6] flex items-center justify-center text-xs font-bold text-white">
                {profile.nickname.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-sm font-medium">{profile.nickname}</span>
            </Link>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </>
        ) : user && !profile ? (
          <Link to="/profile" className="text-sm px-3 py-1.5 rounded-md hover:bg-secondary/40 transition">
            <User className="w-4 h-4 inline mr-1" />
            Account
          </Link>
        ) : isAuthPage ? null : (
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/login" })}>
              Login
            </Button>
            <Button
              size="sm"
              className="bg-[#a855f7] hover:bg-[#9333ea] text-white"
              onClick={() => navigate({ to: "/register" })}
            >
              Register
            </Button>
          </>
        )}
      </nav>
    </header>
  );
}