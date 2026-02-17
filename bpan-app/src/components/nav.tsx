"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, LogOut, Menu, X } from "lucide-react";
import { SearchTrigger } from "@/components/unified-search";

interface NavProps {
  userEmail: string | null;
}

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/library", label: "Library" },
  { href: "/notes", label: "Notes" },
  { href: "/experiments", label: "Experiments" },
  { href: "/results", label: "Results" },
  { href: "/colony", label: "Colony" },
  { href: "/meetings", label: "Meetings" },
  { href: "/ideas", label: "Ideas" },
  { href: "/scout", label: "Scout" },
  { href: "/memory", label: "Memory" },
  { href: "/writing", label: "Writing" },
];

export function Nav({ userEmail }: NavProps) {
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      {/* Subtle accent line at the very top */}
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-4">
          {/* Mobile hamburger */}
          {userEmail && (
            <button
              className="sm:hidden -ml-1 p-1.5 rounded-lg hover:bg-accent transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          )}

          <Link
            href="/dashboard"
            className="flex items-center gap-2 group"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-sm shadow-primary/25 transition-shadow group-hover:shadow-md group-hover:shadow-primary/30">
              B
            </div>
            <span className="text-lg font-semibold tracking-tight">
              BPAN
            </span>
            <span className="hidden sm:inline text-lg font-light tracking-tight text-muted-foreground">
              Platform
            </span>
          </Link>

          {/* Desktop nav */}
          {userEmail && (
            <nav className="hidden sm:flex items-center gap-0.5 text-sm ml-6">
              {NAV_LINKS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                      isActive
                        ? "text-primary bg-primary/8"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    {link.label}
                    {isActive && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-3/5 bg-primary rounded-full" />
                    )}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          {userEmail && <SearchTrigger />}

          {userEmail ? (
          mounted ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 rounded-lg hover:bg-accent">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <span className="hidden sm:inline text-xs truncate max-w-[140px] text-muted-foreground">
                    {userEmail}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  disabled
                  className="text-xs text-muted-foreground"
                >
                  {userEmail}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="ghost" size="sm" className="gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-3.5 w-3.5" />
              </div>
            </Button>
          )
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="rounded-lg">
              <Link href="/auth/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild className="rounded-lg shadow-sm shadow-primary/25">
              <Link href="/auth/signup">Sign up</Link>
            </Button>
          </div>
        )}
        </div>
      </div>

      {/* Mobile nav drawer */}
      {userEmail && mobileOpen && (
        <div className="sm:hidden border-t bg-background/95 backdrop-blur-lg">
          <nav className="flex flex-col py-2 px-4 space-y-0.5">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "text-primary bg-primary/8"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
