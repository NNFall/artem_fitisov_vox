import type { Campaign, CampaignDetail, Contact, Dashboard, ImportResult, Call } from "./types";

const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
const defaultBase =
  window.location.port === "3002"
    ? `${window.location.protocol}//${window.location.hostname}:8002`
    : window.location.origin;

export const API_BASE =
  envBase?.replace(/\/$/, "") ||
  defaultBase;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || "Ошибка запроса");
  }

  return (await response.json()) as T;
}

export const api = {
  login(username: string, password: string) {
    return request<{ ok: boolean; username: string }>("/web/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  logout() {
    return request<{ ok: boolean }>("/web/auth/logout", { method: "POST" });
  },
  me() {
    return request<{ username: string }>("/web/auth/me");
  },
  dashboard() {
    return request<Dashboard>("/web/dashboard");
  },
  campaigns() {
    return request<Campaign[]>("/web/campaigns");
  },
  campaign(id: number) {
    return request<CampaignDetail>(`/web/campaigns/${id}`);
  },
  upload(file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<ImportResult>("/web/imports", {
      method: "POST",
      body: form,
    });
  },
  setCampaignStatus(id: number, action: "run" | "pause" | "rerun") {
    return request<Campaign>(`/web/campaigns/${id}/${action}`, { method: "POST" });
  },
  setDelay(id: number, delaySeconds: number) {
    return request<Campaign>(`/web/campaigns/${id}/delay`, {
      method: "POST",
      body: JSON.stringify({ delay_seconds: delaySeconds }),
    });
  },
  updateContact(id: number, payload: Partial<Contact>) {
    return request<Contact>(`/web/contacts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  calls(limit = 50) {
    return request<Call[]>(`/web/calls?limit=${limit}`);
  },
  call(sessionId: string) {
    return request<Call>(`/web/calls/${encodeURIComponent(sessionId)}`);
  },
  callHistory(phone: string, limit = 100) {
    return request<Call[]>(`/web/call-history?phone=${encodeURIComponent(phone)}&limit=${limit}`);
  },
};
