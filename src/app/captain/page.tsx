import { redirectLegacyCaptain } from "./legacyRedirect";

export default function CaptainPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return redirectLegacyCaptain({ league: "premier", destination: "/my-team", searchParams });
}
