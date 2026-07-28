import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "muhasebe_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 dagen

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string; // "CLIENT" | "ACCOUNTANT"
  [key: string]: string; // index signature voor jose JWTPayload
}

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET ontbreekt of is te kort. Zet een sterke waarde in .env"
    );
  }
  return new TextEncoder().encode(secret);
}

export async function encodeSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecretKey());
}

export async function decodeSession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Zet de sessie-cookie (aanroepen vanuit een Server Action of Route Handler). */
export async function createSessionCookie(payload: SessionPayload) {
  const token = await encodeSession(payload);
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function destroySessionCookie() {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}

/** Lees de huidige sessie (server-side). Geeft null als niet ingelogd. */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await decodeSession(token);
}

export { COOKIE_NAME };
