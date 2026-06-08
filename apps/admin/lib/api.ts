import { getKey, clearKey } from './auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': getKey(),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401) {
    clearKey();
    if (typeof window !== 'undefined') window.location.href = '/auth';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const getStats = () => request<Record<string, number>>('/admin/stats');

export const getUsers = (page = 1) => request<{ users: AdminUser[]; total: number }>(`/admin/users?page=${page}&limit=20`);
export const setUserPlan = (id: string, plan: string) =>
  request(`/admin/users/${id}/plan`, { method: 'PATCH', body: JSON.stringify({ plan }) });

export const getForms    = (page = 1) => request<Paginated<AdminForm>>(`/admin/forms?page=${page}&limit=20`);
export const getInterviews = (page = 1) => request<Paginated<AdminInterview>>(`/admin/interviews?page=${page}&limit=20`);
export const getPayments = (page = 1) => request<Paginated<AdminPayment>>(`/admin/payments?page=${page}&limit=20`);

export const getQueueStats = () => request<QueueStats>('/admin/queues');
export const getFailedJobs = (queue: string) => request<FailedJob[]>(`/admin/queues/${queue}/failed?limit=50`);
export const retryFailedJobs = (queue: string) =>
  request<{ retried: number }>(`/admin/queues/${queue}/retry`, { method: 'POST' });

export const getWebhookInfo  = (bot: string) => request<WebhookInfo>(`/admin/webhooks/${bot}`);
export const registerWebhook = (bot: string, apiBaseUrl: string) =>
  request<{ ok: boolean; url: string }>(`/admin/webhooks/${bot}/register`, {
    method: 'POST',
    body: JSON.stringify({ apiBaseUrl }),
  });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Paginated<T> { items?: T[]; forms?: T[]; interviews?: T[]; payments?: T[]; total: number; page: number }

export interface AdminUser {
  id: string; telegramId: string; username: string | null; firstName: string | null;
  createdAt: string;
  subscription: { plan: string; status: string; responseCount: number; responseLimit: number } | null;
  _count: { forms: number; interviews: number };
}

export interface AdminForm {
  id: string; title: string; status: string; createdAt: string;
  creator: { telegramId: string; username: string | null };
  _count: { responses: number };
}

export interface AdminInterview {
  id: string; title: string; type: string; status: string; completedCount: number; createdAt: string;
  creator: { telegramId: string; username: string | null };
  _count: { sessions: number };
}

export interface AdminPayment {
  id: string; amount: number; status: string; createdAt: string; paidAt: string | null;
  form: { title: string };
  creator: { telegramId: string; username: string | null };
}

export interface QueueStats {
  botUpdates:    QueueCount;
  extraction:    QueueCount;
  notifications: QueueCount;
}

export interface QueueCount {
  name: string; waiting: number; active: number; completed: number; failed: number; delayed: number;
}

export interface FailedJob {
  id: string | undefined; name: string; failedReason: string; attemptsMade: number; timestamp: number;
}

export interface WebhookInfo {
  url: string; has_custom_certificate: boolean; pending_update_count: number;
  last_error_date?: number; last_error_message?: string;
}
