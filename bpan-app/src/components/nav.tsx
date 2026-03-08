"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, LogOut, Menu, X, ChevronDown, Building2, Bell } from "lucide-react";
import { SearchTrigger } from "@/components/unified-search";
import { BrandLogo } from "@/components/brand-logo";
import type { LabMembershipWithLab } from "@/lib/labs";

interface NavProps {
  userEmail: string | null;
  labMemberships?: LabMembershipWithLab[];
  activeLabId?: string | null;
  unreadNotificationCount?: number;
}

type NavLink = { type: "link"; href: string; label: string };
type NavGroup = {
  type: "group";
  label: string;
  basePaths: string[];
  items: (
    | { type?: "link"; href: string; label: string }
    | { type: "section"; label: string; items: { href: string; label: string }[] }
  )[];
};
type NavItem = NavLink | NavGroup;

const PRIMARY_NAV_ITEMS: NavLink[] = [
  { type: "link", href: "/tasks", label: "Dashboard" },
  { type: "link", href: "/experiments", label: "Experiments" },
  { type: "link", href: "/colony/tracker", label: "Tracker" },
  { type: "link", href: "/colony/results", label: "Results" },
  { type: "link", href: "/colony/analysis", label: "Analysis" },
  { type: "link", href: "/colony/pi-access", label: "PI Access" },
  { type: "link", href: "/labs", label: "Labs" },
];

const SECONDARY_NAV_ITEMS: NavItem[] = [
  {
    type: "link",
    href: "/labs/chat",
    label: "Lab chat",
  },
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
      { href: "/colony", label: "Animals" },
      { href: "/colony?tab=cohorts", label: "Cohorts" },
      { href: "/colony?tab=breeders", label: "Breeders" },
      { href: "/colony?tab=housing", label: "Housing" },
      { href: "/colony?tab=cages", label: "Cage change" },
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

export function Nav({ userEmail, labMemberships = [], activeLabId = null, unreadNotificationCount = 0 }: NavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const activeLab = activeLabId
    ? (labMemberships.find((membership) => membership.lab.id === activeLabId) ?? null)
    : null;
  const workspaceLabel = activeLab ? activeLab.lab.name : "Personal";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  const primaryIsActive = (href: string) => pathname === href;
  const notificationsActive = pathname.startsWith("/notifications");
  const moreIsActive = SECONDARY_NAV_ITEMS.some((item) =>
    item.type === "group"
      ? item.basePaths.some((basePath) => pathname.startsWith(basePath))
      : pathname === item.href
  );
  const flatSecondaryLinks = SECONDARY_NAV_ITEMS.flatMap((item) =>
    item.type === "group"
      ? item.items.flatMap((sub) =>
          sub.type === "section"
            ? sub.items.map((sectionLink) => ({
                href: sectionLink.href,
                label: `${item.label} › ${sub.label} › ${sectionLink.label}`,
                mobileLabel: sectionLink.label,
              }))
            : [{ href: sub.href, label: `${item.label} › ${sub.label}`, mobileLabel: sub.label }]
        )
      : [{ href: item.href, label: item.label, mobileLabel: item.label }]
  );

  const renderSecondaryDropdownItems = () =>
    SECONDARY_NAV_ITEMS.map((item, index) => {
      if (item.type === "group") {
        return (
            <DropdownMenuSub key={item.label}>
              <DropdownMenuSubTrigger>{item.label}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56 border-white/80 bg-white/95 backdrop-blur-xl">
                {item.items.map((subItem) =>
                  subItem.type === "section" ? (
                    <div key={`${item.label}-${subItem.label}`} className="py-1">
                      <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {subItem.label}
                      </div>
                      {subItem.items.map((sectionLink) => (
                        <DropdownMenuItem key={sectionLink.href} asChild>
                          <Link href={sectionLink.href} className="cursor-pointer">
                            {sectionLink.label}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ) : (
                    <DropdownMenuItem key={subItem.href} asChild>
                      <Link href={subItem.href} className="cursor-pointer">
                        {subItem.label}
                      </Link>
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
      }

      return (
        <div key={item.href}>
          <DropdownMenuItem asChild>
            <Link href={item.href} className="cursor-pointer">
              {item.label}
            </Link>
          </DropdownMenuItem>
          {index < SECONDARY_NAV_ITEMS.length - 1 ? <DropdownMenuSeparator /> : null}
        </div>
      );
    });

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/70 bg-white/75 backdrop-blur-xl supports-[backdrop-filter]:bg-white/65">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-2 px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-4">
          {userEmail && (
            <button
              className="sm:hidden -ml-1 p-1.5 rounded-lg hover:bg-accent transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}

          <Link href="/tasks" className="flex items-center gap-2 group min-w-0">
            <BrandLogo
              className="h-7 w-7 shrink-0 transition-transform group-hover:scale-[1.03]"
              imageClassName="drop-shadow-[0_4px_8px_rgba(15,23,42,0.12)]"
              fallbackClassName="text-xs shadow-sm shadow-cyan-900/20 group-hover:shadow-md group-hover:shadow-cyan-900/25"
              alt="BPAN mouse scientist logo"
            />
            <span className="truncate text-sm font-semibold tracking-tight text-slate-900">BPAN</span>
          </Link>

          {userEmail && (
            <div className="hidden md:block lg:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-900">
                    Menu
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 border-white/80 bg-white/95 backdrop-blur-xl">
                  {PRIMARY_NAV_ITEMS.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href} className="cursor-pointer">
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  {renderSecondaryDropdownItems()}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {userEmail && (
            <nav className="ml-2 hidden items-center gap-1 text-sm lg:flex">
              {PRIMARY_NAV_ITEMS.map((item) => {
                const isActive = primaryIsActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
                      isActive
                        ? "bg-cyan-100/70 text-cyan-900"
                        : "text-slate-600 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    {item.label}
                    {isActive ? <span className="absolute inset-x-2 -bottom-[1px] h-[2px] rounded-full bg-cyan-600" /> : null}
                  </Link>
                );
              })}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`relative inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
                      moreIsActive
                        ? "bg-cyan-100/70 text-cyan-900"
                        : "text-slate-600 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    More
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    {moreIsActive ? <span className="absolute inset-x-2 -bottom-[1px] h-[2px] rounded-full bg-cyan-600" /> : null}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 border-white/80 bg-white/95 backdrop-blur-xl">
                  {renderSecondaryDropdownItems()}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {userEmail && <div className="hidden sm:block"><SearchTrigger /></div>}
          {userEmail && (
            <Button asChild variant="ghost" size="sm" className="relative h-8 w-8 rounded-lg p-0 hover:bg-white/90">
              <Link href="/notifications" aria-label="Notifications">
                <Bell className={`h-4 w-4 ${notificationsActive ? "text-cyan-700" : "text-slate-600"}`} />
                {unreadNotificationCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
                    {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                  </span>
                ) : null}
              </Link>
            </Button>
          )}
          {userEmail && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 rounded-lg p-0 hover:bg-white/90">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
                    <Building2 className="h-3.5 w-3.5" />
                  </div>
                  <span className="sr-only">{workspaceLabel}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 border-white/80 bg-white/95 backdrop-blur-xl">
                <DropdownMenuItem disabled>
                  Personal workspace
                </DropdownMenuItem>
                {labMemberships.length > 0 ? <DropdownMenuSeparator /> : null}
                {labMemberships.map((membership) => (
                  <DropdownMenuItem key={membership.id} disabled>
                    {membership.lab.name} ({membership.role})
                    {activeLab?.lab.id === membership.lab.id ? " • Active" : ""}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/labs" className="cursor-pointer">
                    Manage labs
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {userEmail ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 rounded-lg p-0 hover:bg-white/90">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <span className="sr-only">{userEmail}</span>
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
          <nav className="max-h-[calc(100vh-3rem)] space-y-1.5 overflow-y-auto px-3 py-2">
            <div className="pb-1">
              <SearchTrigger />
            </div>
            <div className="space-y-0.5">
              {PRIMARY_NAV_ITEMS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`block rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                      isActive
                        ? "bg-cyan-100/70 text-cyan-900"
                        : "text-slate-700 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
            <details className="rounded-lg border border-slate-200 bg-white/80">
              <summary className="cursor-pointer list-none px-2.5 py-2 text-[13px] font-medium text-slate-700">
                More
              </summary>
              <div className="space-y-0.5 border-t border-slate-200 px-2 py-2">
                {flatSecondaryLinks.map((link) => {
                  const isActive = pathname === link.href.split("?")[0];
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={`block rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                        isActive
                          ? "bg-cyan-100/70 text-cyan-900"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      {link.mobileLabel}
                    </Link>
                  );
                })}
              </div>
            </details>
            <Link
              href="/notifications"
              onClick={() => setMobileOpen(false)}
              className={`block rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                notificationsActive
                  ? "bg-cyan-100/70 text-cyan-900"
                  : "text-slate-700 hover:bg-white hover:text-slate-900"
              }`}
            >
              Notifications
              {unreadNotificationCount > 0 ? ` (${unreadNotificationCount > 99 ? "99+" : unreadNotificationCount})` : ""}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
