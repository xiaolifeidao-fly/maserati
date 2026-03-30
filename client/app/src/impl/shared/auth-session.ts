import { type AuthSession } from "@eleapi/auth/auth.api";
import { getGlobal, removeGlobal, setGlobal } from "@utils/store/electron";

const AUTH_SESSION_STORE_KEY = "auth_session";

function normalizeValue(value?: string): string {
  return String(value ?? "").trim();
}

function buildStoredSession(value: unknown): AuthSession {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<AuthSession>;
  const token = normalizeValue(raw.token) || undefined;

  if (!token) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    username: normalizeValue(raw.username) || undefined,
    displayName: normalizeValue(raw.displayName) || undefined,
    token,
  };
}

export function readAuthSession(): AuthSession {
  return buildStoredSession(getGlobal(AUTH_SESSION_STORE_KEY));
}

export function saveAuthSession(session: AuthSession): AuthSession {
  const normalizedSession: AuthSession = {
    authenticated: Boolean(session.token),
    username: normalizeValue(session.username) || undefined,
    displayName: normalizeValue(session.displayName) || undefined,
    token: normalizeValue(session.token) || undefined,
  };

  if (!normalizedSession.token) {
    removeGlobal(AUTH_SESSION_STORE_KEY);
    return { authenticated: false };
  }

  setGlobal(AUTH_SESSION_STORE_KEY, normalizedSession);
  return normalizedSession;
}

export function clearAuthSession() {
  removeGlobal(AUTH_SESSION_STORE_KEY);
}
