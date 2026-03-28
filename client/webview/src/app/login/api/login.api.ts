"use client";

import { type AuthSession } from "@eleapi/auth/auth.api";
import { login as electronLogin, register as electronRegister } from "@/utils/auth";

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  username: string;
  password: string;
}

export async function login(payload: LoginPayload): Promise<AuthSession> {
  return electronLogin(payload);
}

export async function register(payload: RegisterPayload): Promise<AuthSession> {
  return electronRegister(payload);
}
