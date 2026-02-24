"use client";

import { useState, useEffect, useRef } from "react";
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
import { User, LogOut, Menu, X, ChevronDown } from "lucide-react";
import { SearchTrigger } from "@/components/unified-search";
import { BrandLogo } from "@/components/brand-logo";

interface NavProps {
  userEmail: string | null;
}

type NavLink = { type: "link"; href: string; label: string };
type NavGroup = {
  type: "group";
  label: string;
  basePaths: string[];
  items: { href: string; label: string }[];
};
type NavItem = NavLink | NavGroup;

const NAV_ITEMS: NavItem[] = [
  { type: "link", href: "/tasks", label: "Dashboard" },
  { type: "link", href: "/experiments", label: "Calendar" },
  {
    type: "group",
    label: "Literature",
    basePaths: ["/dashboard", "/library", "/scout"],
    items: [
      { href: "/dashboard", label: "Search" },
      { href: "/library", label: "Library" },
      { href: "/scout", label: "Scout" },
    ],
  },
  {
    type: "group",
    label: "Colony",
    basePaths: ["/colony"],
    items: [
      { href: "/colony", label: "🐭 Colony" },
      { href: "/colony?tab=tracker", label: "📋 Tracker" },
      { href: "/colony?tab=results", label: "📊 Results" },
      { href: "/colony?tab=analysis", label: "📈 Analysis" },
    ],
  },
  {
    type: "group",
    label: "Notebook",
    basePaths: ["/notes", "/meetings", "/ideas", "/writing", "/memory"],
    items: [
      { href: "/notes", label: "Notes" },
      { href: "/meetings", label: "Meetings" },
      { href: "/ideas", label: "Ideas" },
      { href: "/writing", label: "Writing" },
      { href: "/memory", label: "Memory" },
    ],
  },
];

// ─── Hover dropdown group ────────────────────────────────────────────────────

function NavGroupItem({ item, pathname }: { item: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActive = item.basePaths.some((p) => pathname.startsWith(p));

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(true);
  };
  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button
        className={`relative flex items-center gap-0.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
          isActive
            ? "text-cyan-900 bg-cyan-100/70"
            : "text-slate-600 hover:text-slate-900 hover:bg-white"
        }`}
      >
        {item.label}
        <ChevronDown
          className={`h-3 w-3 opacity-60 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
        {isActive && (
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-3/5 bg-cyan-600 rounded-full" />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1.5 min-w-[170px] rounded-xl border border-white/80 bg-white/90 p-1 shadow-[0_14px_30px_-18px_rgba(15,23,42,0.28)] backdrop-blur-xl">
          {item.items.map((sub) => (
            <Link
              key={sub.href}
              href={sub.href}
              className="flex items-center rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              {sub.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Nav ───────────────────────────────────────────────────────────────

export function Nav({ userEmail }: NavProps) {
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  // Flat list for mobile drawer
  const mobileLinks: { href: string; label: string }[] = [];
  for (const item of NAV_ITEMS) {
    if (item.type === "link") {
      mobileLinks.push({ href: item.href, label: item.label });
    } else {
      for (const sub of item.items) {
        mobileLinks.push({ href: sub.href, label: `${item.label} › ${sub.label.replace(/^[^\s]+\s/, "")}` });
      }
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/70 bg-white/75 backdrop-blur-xl supports-[backdrop-filter]:bg-white/65">
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-500/45 to-transparent" />

      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          {userEmail && (
            <button
              className="sm:hidden -ml-1 p-1.5 rounded-lg hover:bg-accent transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}

          <Link href="/tasks" className="flex items-center gap-2.5 group">
            <BrandLogo
              className="h-8 w-8 transition-transform group-hover:scale-[1.03]"
              imageClassName="drop-shadow-[0_4px_8px_rgba(15,23,42,0.12)]"
              fallbackClassName="text-xs shadow-sm shadow-cyan-900/20 group-hover:shadow-md group-hover:shadow-cyan-900/25"
              alt="BPAN mouse scientist logo"
            />
            <div className="leading-none">
              <span className="block text-[15px] font-semibold tracking-tight text-slate-900">BPAN Platform</span>
              <span className="hidden sm:block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Care + Research Workspace</span>
            </div>
          </Link>

          {userEmail && (
            <nav className="hidden sm:flex items-center gap-0.5 text-sm ml-6">
              {NAV_ITEMS.map((item) => {
                if (item.type === "link") {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`relative px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                        isActive
                          ? "text-cyan-900 bg-cyan-100/70"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white"
                      }`}
                    >
                      {item.label}
                      {isActive && (
                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-3/5 bg-cyan-600 rounded-full" />
                      )}
                    </Link>
                  );
                }
                return <NavGroupItem key={item.label} item={item} pathname={pathname} />;
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
                  <Button variant="ghost" size="sm" className="gap-2 rounded-xl hover:bg-white/90">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
                      <User className="h-3.5 w-3.5" />
                    </div>
                    <span className="hidden max-w-[140px] truncate text-xs text-slate-600 sm:inline">
                      {userEmail}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 border-white/80 bg-white/95 backdrop-blur-xl">
                  <DropdownMenuItem disabled className="text-xs text-slate-500">
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
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
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

      {/* Mobile drawer */}
      {userEmail && mobileOpen && (
        <div className="sm:hidden border-t border-white/70 bg-white/90 backdrop-blur-lg">
          <nav className="flex flex-col py-2 px-4 space-y-0.5">
            {mobileLinks.map((link) => {
              const isActive = pathname === link.href.split("?")[0];
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "text-cyan-900 bg-cyan-100/70"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white"
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
