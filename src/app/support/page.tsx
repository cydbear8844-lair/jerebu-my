import { SupportPage } from "@/components/support-page";
import { projectSupportAvailable } from "@/lib/project-info";
import { getRequestSnapshot } from "@/server/request-snapshot";

export default async function Page() {
  const snapshot = await getRequestSnapshot();
  return <SupportPage available={projectSupportAvailable(snapshot.mode)} />;
}
