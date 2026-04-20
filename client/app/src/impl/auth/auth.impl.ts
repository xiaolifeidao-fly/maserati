import {
  AuthApi,
  type AuthSession,
  type ChangePasswordInput,
  type CurrentUserProfile,
  type LoginInput,
  type RegisterInput,
  type UpdateCurrentUserProfileInput,
} from "@eleapi/auth/auth.api";
import { requestBackend } from "../shared/backend";
import { clearAuthSession, readAuthSession, saveAuthSession } from "../shared/auth-session";

interface LoginResponse {
  token: string;
}

interface ValidateSessionResponse {
  id: number;
  username: string;
  displayName?: string;
}

const authAdapter = {
  async login(input: LoginInput): Promise<AuthSession> {
    const result = await requestBackend<LoginResponse>("POST", "/login", { data: input });
    return saveAuthSession({
      authenticated: true,
      username: input.username.trim(),
      displayName: input.username.trim(),
      token: result.token,
    });
  },

  async register(input: RegisterInput): Promise<AuthSession> {
    await requestBackend("POST", "/register", { data: input });
    return authAdapter.login({
      username: input.username,
      password: input.password,
    });
  },

  async logout(): Promise<void> {
    const session = readAuthSession();
    if (session.token) {
      try {
        await requestBackend("POST", "/logout", { token: session.token });
      } finally {
        clearAuthSession();
      }
      return;
    }
    clearAuthSession();
  },

  async getAuthState(): Promise<AuthSession> {
    return readAuthSession();
  },

  async getToken(): Promise<string> {
    return readAuthSession().token || "";
  },

  async validateStoredSession(): Promise<AuthSession> {
    const session = readAuthSession();
    if (!session.token) {
      clearAuthSession();
      return { authenticated: false };
    }

    try {
      const result = await requestBackend<ValidateSessionResponse>("GET", "/auth-state", {
        token: session.token,
      });

      return saveAuthSession({
        authenticated: true,
        username: result.username.trim(),
        displayName: result.displayName?.trim() || result.username.trim(),
        token: session.token,
      });
    } catch {
      return {
        ...session,
        authenticated: false,
      };
    }
  },

  async getCurrentProfile(): Promise<CurrentUserProfile> {
    return requestBackend<CurrentUserProfile>("GET", "/app-user-profile");
  },

  async updateCurrentProfile(input: UpdateCurrentUserProfileInput): Promise<CurrentUserProfile> {
    const result = await requestBackend<CurrentUserProfile>("PUT", "/app-user-profile", { data: input });
    const session = readAuthSession();
    if (session.token) {
      saveAuthSession({
        ...session,
        authenticated: true,
        username: result.username?.trim() || session.username,
        displayName: result.name?.trim() || result.username?.trim() || session.displayName,
      });
    }
    return result;
  },

  async changePassword(input: ChangePasswordInput): Promise<void> {
    await requestBackend("PUT", "/app-user-profile/password", { data: input });
  },
};

export class AuthImpl extends AuthApi {
  async login(input: LoginInput): Promise<AuthSession> {
    return authAdapter.login(input);
  }

  async register(input: RegisterInput): Promise<AuthSession> {
    return authAdapter.register(input);
  }

  async logout(): Promise<void> {
    return authAdapter.logout();
  }

  async getAuthState(): Promise<AuthSession> {
    return authAdapter.getAuthState();
  }

  async getToken(): Promise<string> {
    return authAdapter.getToken();
  }

  async validateStoredSession(): Promise<AuthSession> {
    return authAdapter.validateStoredSession();
  }

  async getCurrentProfile(): Promise<CurrentUserProfile> {
    return authAdapter.getCurrentProfile();
  }

  async updateCurrentProfile(input: UpdateCurrentUserProfileInput): Promise<CurrentUserProfile> {
    return authAdapter.updateCurrentProfile(input);
  }

  async changePassword(input: ChangePasswordInput): Promise<void> {
    return authAdapter.changePassword(input);
  }
}
