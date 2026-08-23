import { CaptainScoutingPageView } from "@/app/captain/scouting/page";

export default function AcademyCaptainScoutingPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  return <CaptainScoutingPageView searchParams={searchParams} league="academy" />;
}
