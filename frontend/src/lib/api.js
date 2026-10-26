import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const KEY = "flipcraft_studio_key";

export function getStudioKey() {
  let k = localStorage.getItem(KEY);
  if (!k) {
    const a = new Uint8Array(24);
    crypto.getRandomValues(a);
    k = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(KEY, k);
  }
  return k;
}

export const setStudioKey = (k) => localStorage.setItem(KEY, k);

export const api = axios.create({ baseURL: API });
api.interceptors.request.use((c) => {
  c.headers["X-Owner-Key"] = getStudioKey();
  return c;
});

export const publicApi = axios.create({ baseURL: API });

export function visitorId() {
  let v = localStorage.getItem("flipcraft_visitor");
  if (!v) {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    v = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("flipcraft_visitor", v);
  }
  return v;
}

export function track(id, body) {
  try {
    const owner = localStorage.getItem(KEY);
    publicApi.post(`/flipbooks/${id}/track`, { visitor: visitorId(), ...body }, { headers: owner ? { "X-Owner-Key": owner } : {} }).catch(() => {});
  } catch {
    /* storage blocked in some embeds */
  }
}

export const fileUrl = (p) => (!p ? "" : /^https?:\/\//.test(p) ? p : `${API}/files/${p}`);

export function errMsg(e, fallback = "Something went wrong") {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d.map((x) => x.msg?.replace("Value error, ", "")).join(", ");
  return d || fallback;
}

export const uploadMedia = (file, onProgress) => {
  const fd = new FormData();
  fd.append("file", file);
  return api
    .post("/media", fd, { onUploadProgress: (e) => onProgress?.(Math.round((e.loaded / (e.total || 1)) * 100)) })
    .then((r) => r.data);
};

export function toEmbed(url = "") {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0&playsinline=1`;
  const vm = url.match(/vimeo\.com\/(?:video\/|channels\/[\w-]+\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
}
