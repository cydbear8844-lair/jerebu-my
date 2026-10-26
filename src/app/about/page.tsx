import { About } from "@/components/about";
import { getRequestSnapshot } from "@/server/request-snapshot";
import { projectSupportAvailable } from "@/lib/project-info";

export default async function Page() {
  const snapshot = await getRequestSnapshot();
  return <About supportAvailable={projectSupportAvailable(snapshot.mode)} />;
}
