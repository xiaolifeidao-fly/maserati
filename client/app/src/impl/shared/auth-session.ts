import { type AuthSession } from "@eleapi/auth/auth.api";

let currentSession: AuthSession = { authenticated: false };

function normalizeValue(value?: string): string {
  return String(value ?? "").trim();
}

export function readAuthSession(): AuthSession {
  if (!currentSession.token) {
    return { authenticated: false };
  }
  return {
    authenticated: true,
    username: currentSession.username,
    displayName: currentSession.displayName,
    token: currentSession.token,
  };
}

export function saveAuthSession(session: AuthSession): AuthSession {
  const normalizedSession: AuthSession = {
    authenticated: Boolean(session.token),
    username: normalizeValue(session.username) || undefined,
    displayName: normalizeValue(session.displayName) || undefined,
    token: normalizeValue(session.token) || undefined,
  };

  if (!normalizedSession.token) {
    currentSession = { authenticated: false };
    return { authenticated: false };
  }

  currentSession = normalizedSession;
  return normalizedSession;
}

export function clearAuthSession() {
  currentSession = { authenticated: false };
}
