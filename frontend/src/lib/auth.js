import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  // undefined = still checking, null = signed out, object = signed in
  const [account, setAccount] = useState(getToken() ? undefined : null);

  useEffect(() => {
    if (!getToken()) return;
    api.get("/auth/me").then((r) => setAccount(r.data)).catch(() => { setToken(null); setAccount(null); });
  }, []);

  const signIn = useCallback(async (path, body) => {
    const { data } = await api.post(path, body);
    setToken(data.token);
    const { token, ...rest } = data;
    setAccount(rest);
    return rest;
  }, []);

  const value = {
    account,
    login: (email, password) => signIn("/auth/login", { email, password }),
    signup: (form) => signIn("/auth/signup", form),
    logout: () => { setToken(null); setAccount(null); window.location.assign("/login"); },
  };
  return createElement(AuthCtx.Provider, { value }, children);
}

export const useAuth = () => useContext(AuthCtx);
