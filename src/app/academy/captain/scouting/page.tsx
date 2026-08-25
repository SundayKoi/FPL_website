import { redirectLegacyCaptain } from "@/app/captain/legacyRedirect";

export default function AcademyCaptainScoutingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return redirectLegacyCaptain({ league: "academy", destination: "/academy/my-team/scouting", searchParams });
}
