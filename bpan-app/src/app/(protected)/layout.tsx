import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { AdvisorSidebar } from "@/components/advisor-sidebar";
import { UnifiedSearch } from "@/components/unified-search";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_-10%,rgba(124,196,214,0.14),transparent_35%),radial-gradient(circle_at_100%_0%,rgba(239,210,171,0.12),transparent_38%),linear-gradient(180deg,#f7faf8,#eef6f5)]">
      <Nav userEmail={user?.email ?? null} />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>
      {user && <AdvisorSidebar />}
      {user && <UnifiedSearch />}
    </div>
  );
}
