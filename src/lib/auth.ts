import { NextResponse } from "next/server";
import { getSession, SessionPayload } from "./session";

/**
 * Hulpfunctie voor API-routes: vereist een ingelogde gebruiker.
 * Gooit een Response (via het NextResponse-object) als niet ingelogd.
 */
export async function requireUser(): Promise<
  { session: SessionPayload } | { error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json(
        { error: "Oturum açmanız gerekiyor." },
        { status: 401 }
      ),
    };
  }
  return { session };
}

export function isAccountant(session: SessionPayload): boolean {
  return session.role === "ACCOUNTANT";
}
