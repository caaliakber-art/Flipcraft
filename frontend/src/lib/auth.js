import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  // undefined = still checking, null = signed out, object = signed in
  const [account, setAccount] = useState(getToken() ? undefined : null);

  useEffect(() => {
    if (!getToken()) return;
    // Only a real "not signed in" answer logs you out. If the server is briefly
    // unreachable (waking up, restarting), keep the login and try again.
    let tries = 0, timer = 0, live = true;
    const check = () => api.get("/auth/me").then((r) => live && setAccount(r.data)).catch((e) => {
      if (!live) return;
      if (e?.response?.status === 401) { setToken(null); setAccount(null); return; }
      tries += 1;
      timer = setTimeout(check, Math.min(15000, 2000 * tries));
    });
    check();
    return () => { live = false; clearTimeout(timer); };
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
