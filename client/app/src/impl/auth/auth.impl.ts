import { AuthApi, type AuthSession, type LoginInput, type RegisterInput } from "@eleapi/auth/auth.api";
import { requestBackend } from "../shared/backend";
import { clearAuthSession, readAuthSession, saveAuthSession } from "../shared/auth-session";

interface LoginResponse {
  token: string;
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
}
