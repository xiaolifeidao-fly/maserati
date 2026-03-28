import { ElectronApi, InvokeType, Protocols } from "../base";

export interface LoginInput {
  username: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  username: string;
  password: string;
}

export interface AuthSession {
  authenticated: boolean;
  username?: string;
  displayName?: string;
  token?: string;
}

export class AuthApi extends ElectronApi {
  getApiName(): string {
    return "auth";
  }

  @InvokeType(Protocols.INVOKE)
  async login(input: LoginInput): Promise<AuthSession> {
    return this.invokeApi("login", input);
  }

  @InvokeType(Protocols.INVOKE)
  async register(input: RegisterInput): Promise<AuthSession> {
    return this.invokeApi("register", input);
  }

  @InvokeType(Protocols.INVOKE)
  async logout(): Promise<void> {
    return this.invokeApi("logout");
  }

  @InvokeType(Protocols.INVOKE)
  async getAuthState(): Promise<AuthSession> {
    return this.invokeApi("getAuthState");
  }

  @InvokeType(Protocols.INVOKE)
  async getToken(): Promise<string> {
    return this.invokeApi("getToken");
  }
}
