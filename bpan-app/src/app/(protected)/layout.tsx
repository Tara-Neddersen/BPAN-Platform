import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { AdvisorSidebar } from "@/components/advisor-sidebar";

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
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      {user && <AdvisorSidebar />}
    </>
  );
}
