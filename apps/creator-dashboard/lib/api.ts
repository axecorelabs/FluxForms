'use client';

import { getToken, clearToken } from './auth';
import type {
  Interview,
  InterviewStats,
  InterviewSession,
  SessionDetail,
  SearchResult,
  Form,
  FormsPage,
  FormResponsesPage,
  OverviewData,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/auth/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function exchangeMagicToken(token: string): Promise<{ accessToken: string; hasEmail: boolean }> {
  return publicPost('/auth/dashboard/exchange', { token });
}

export async function getProfile(): Promise<{ hasEmail: boolean; telegramLinked: boolean; email: string | null; displayName: string | null }> {
  return request('/auth/profile');
}

export async function requestEmailAdd(email: string): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/email/add', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyEmailAdd(email: string, code: string): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/email/add/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function requestOtp(email: string): Promise<{ message: string }> {
  return publicPost('/auth/email/request', { email });
}

export async function verifyOtp(email: string, code: string): Promise<{ accessToken: string; telegramLinked: boolean }> {
  return publicPost('/auth/email/verify', { email, code });
}

export async function requestTelegramLink(): Promise<{ token: string; deepLink: string }> {
  return request<{ token: string; deepLink: string }>('/auth/telegram/link-request', { method: 'POST' });
}

export async function getTelegramLinkStatus(): Promise<{ linked: boolean }> {
  return request<{ linked: boolean }>('/auth/telegram/link-status');
}

export async function getInterviews(): Promise<Interview[]> {
  return request<Interview[]>('/interviews');
}

export async function getInterview(id: string): Promise<Interview> {
  return request<Interview>(`/interviews/${id}`);
}

export async function getInterviewStats(id: string): Promise<InterviewStats> {
  return request<InterviewStats>(`/interviews/${id}/stats`);
}

export async function getInterviewSessions(id: string): Promise<InterviewSession[]> {
  return request<InterviewSession[]>(`/interviews/${id}/sessions`);
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/sessions/${sessionId}`);
}

export async function getOverview(): Promise<OverviewData> {
  return request<OverviewData>('/forms/overview');
}

export async function getForms(page = 1): Promise<FormsPage> {
  return request<FormsPage>(`/forms?page=${page}`);
}

export async function getForm(id: string): Promise<Form> {
  return request<Form>(`/forms/${id}`);
}

export async function getFormResponses(id: string, page = 1): Promise<FormResponsesPage> {
  return request<FormResponsesPage>(`/forms/${id}/responses?page=${page}`);
}

export async function searchSessions(
  interviewId: string,
  query: string,
): Promise<{ results: SearchResult[] }> {
  const params = new URLSearchParams({ q: query });
  return request<{ results: SearchResult[] }>(`/interviews/${interviewId}/search?${params}`);
}
