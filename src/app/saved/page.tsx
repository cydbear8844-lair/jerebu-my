import { SavedLocations } from "@/components/saved-locations";
import { getRequestSnapshot } from "@/server/request-snapshot";

export const dynamic = "force-dynamic";
export default async function Page() {
  return <SavedLocations stations={(await getRequestSnapshot()).stations} />;
}
