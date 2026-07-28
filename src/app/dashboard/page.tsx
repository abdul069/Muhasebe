import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardClient
      user={{
        name: session.name,
        email: session.email,
        role: session.role,
      }}
    />
  );
}
