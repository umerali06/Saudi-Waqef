import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-helpers";

// Print pages live outside the app shell, whose fixed-height layout would cut off the paper.
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return <main className="min-h-screen bg-white">{children}</main>;
}
