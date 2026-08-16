import { CaptainPageView } from "@/app/captain/page";

export default function AcademyCaptainPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  return <CaptainPageView searchParams={searchParams} league="academy" />;
}
