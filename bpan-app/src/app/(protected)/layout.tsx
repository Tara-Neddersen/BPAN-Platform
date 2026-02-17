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
    <>
      <Nav userEmail={user?.email ?? null} />
      <main className="mx-auto max-w-6xl px-6 py-8 min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>
      {user && <AdvisorSidebar />}
      {user && <UnifiedSearch />}
    </>
  );
}
