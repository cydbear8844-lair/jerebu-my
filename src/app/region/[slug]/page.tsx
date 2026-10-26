import { notFound } from "next/navigation";
import { getRegion } from "@/lib/regions";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const region = getRegion(slug);
  if (!region) notFound();
  return null;
}
