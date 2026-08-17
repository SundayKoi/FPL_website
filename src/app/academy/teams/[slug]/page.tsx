import { redirect } from "next/navigation";

export default async function AcademyTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/teams/${slug}?league=academy`);
}
