import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-helpers";
import { listMembershipsByUser } from "@/lib/data/memberships";
import { NoAccessPanel } from "./no-access-panel";

/** Where a signed-in user without any company lands, instead of a redirect loop. */
export default async function NoAccessPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if ((await listMembershipsByUser(user.id)).length > 0) {
    redirect("/dashboard");
  }
  return <NoAccessPanel email={user.email ?? ""} />;
}
