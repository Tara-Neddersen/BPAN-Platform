import PIPortalPageClient from "@/components/pi-portal-page";

export default async function PIPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <PIPortalPageClient token={token} />;
}
