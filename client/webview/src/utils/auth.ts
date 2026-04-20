"use client";

import {
  AuthApi,
  type AuthSession,
  type ChangePasswordInput,
  type CurrentUserProfile,
  type LoginInput,
  type RegisterInput,
  type UpdateCurrentUserProfileInput,
} from "@eleapi/auth/auth.api";

type AuthBridge = {
  login?: (...args: unknown[]) => Promise<unknown>;
  register?: (...args: unknown[]) => Promise<unknown>;
  logout?: (...args: unknown[]) => Promise<unknown>;
  getAuthState?: (...args: unknown[]) => Promise<unknown>;
  getToken?: (...args: unknown[]) => Promise<unknown>;
  validateStoredSession?: (...args: unknown[]) => Promise<unknown>;
  getCurrentProfile?: (...args: unknown[]) => Promise<unknown>;
  updateCurrentProfile?: (...args: unknown[]) => Promise<unknown>;
  changePassword?: (...args: unknown[]) => Promise<unknown>;
};

function getWindowBridgeState() {
  if (typeof window === "undefined") {
    return {
      authBridge: undefined,
      bridgeMeta: undefined,
      preloadPing: undefined,
      bridgeError: undefined,
    };
  }

  const electronWindow = window as typeof window & {
    auth?: AuthBridge;
    __ELECTRON_BRIDGE__?: {
      ready?: boolean;
      apis?: string[];
    };
    __ELECTRON_PRELOAD_PING__?: {
      loaded?: boolean;
    };
    __ELECTRON_BRIDGE_ERROR__?: {
      message?: string;
    };
  };

  return {
    authBridge: electronWindow.auth,
    bridgeMeta: electronWindow.__ELECTRON_BRIDGE__,
    preloadPing: electronWindow.__ELECTRON_PRELOAD_PING__,
    bridgeError: electronWindow.__ELECTRON_BRIDGE_ERROR__,
  };
}

function hasAuthBridge(authBridge?: AuthBridge) {
  return Boolean(
    authBridge &&
      typeof authBridge.login === "function" &&
      typeof authBridge.register === "function" &&
      typeof authBridge.logout === "function" &&
      typeof authBridge.getAuthState === "function" &&
      typeof authBridge.getToken === "function" &&
      typeof authBridge.validateStoredSession === "function" &&
      typeof authBridge.getCurrentProfile === "function" &&
      typeof authBridge.updateCurrentProfile === "function" &&
      typeof authBridge.changePassword === "function",
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAuthBridge(timeoutMs = 1500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const { authBridge } = getWindowBridgeState();
    if (hasAuthBridge(authBridge)) {
      return true;
    }
    await sleep(50);
  }
  return false;
}

function buildUnavailableMessage() {
  if (typeof window === "undefined") {
    return "electron auth api is not available";
  }

  const { authBridge, bridgeMeta, preloadPing, bridgeError } = getWindowBridgeState();
  const hasElectronUA = window.navigator.userAgent.includes("Electron");
  const bridgeApis = Array.isArray(bridgeMeta?.apis) ? bridgeMeta.apis.join(",") : "";
  const authMethods = authBridge ? Object.keys(authBridge).join(",") : "";

  return [
    "electron auth api is not available",
    `electronUserAgent=${hasElectronUA}`,
    `preloadLoaded=${Boolean(preloadPing?.loaded)}`,
    `bridgeReady=${Boolean(bridgeMeta?.ready)}`,
    `bridgeApis=${bridgeApis || "none"}`,
    `authMethods=${authMethods || "none"}`,
    `bridgeError=${bridgeError?.message || "none"}`,
  ].join(" | ");
}

async function createAuthApi() {
  if (!(await waitForAuthBridge())) {
    return null;
  }
  return new AuthApi();
}

export async function login(input: LoginInput): Promise<AuthSession> {
  const authApi = await createAuthApi();
  if (!authApi) {
    throw new Error(buildUnavailableMessage());
  }
  return authApi.login(input);
}

export async function register(input: RegisterInput): Promise<AuthSession> {
  const authApi = await createAuthApi();
  if (!authApi) {
    throw new Error(buildUnavailableMessage());
  }
  return authApi.register(input);
}

export async function logout() {
  const authApi = await createAuthApi();
  if (!authApi) {
    return;
  }
  await authApi.logout();
}

export async function getAuthState(): Promise<AuthSession> {
  const authApi = await createAuthApi();
  if (!authApi) {
    return { authenticated: false };
  }
  return authApi.getAuthState();
}

export async function getAuthToken() {
  const authApi = await createAuthApi();
  if (!authApi) {
    return "";
  }
  return authApi.getToken();
}

export async function isAuthenticated() {
  const session = await getAuthState();
  return Boolean(session.authenticated);
}

export async function validateStoredSession(): Promise<AuthSession> {
  const authApi = await createAuthApi();
  if (!authApi) {
    return { authenticated: false };
  }
  return authApi.validateStoredSession();
}

export async function hasValidSession() {
  const session = await validateStoredSession();
  return Boolean(session.authenticated);
}

export async function getCurrentProfile(): Promise<CurrentUserProfile> {
  const authApi = await createAuthApi();
  if (!authApi) {
    throw new Error(buildUnavailableMessage());
  }
  return authApi.getCurrentProfile();
}

export async function updateCurrentProfile(input: UpdateCurrentUserProfileInput): Promise<CurrentUserProfile> {
  const authApi = await createAuthApi();
  if (!authApi) {
    throw new Error(buildUnavailableMessage());
  }
  return authApi.updateCurrentProfile(input);
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const authApi = await createAuthApi();
  if (!authApi) {
    throw new Error(buildUnavailableMessage());
  }
  await authApi.changePassword(input);
}
