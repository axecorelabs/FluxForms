'use client';

import { getToken, clearToken } from './auth';
import type {
  Interview,
  InterviewField,
  InterviewStats,
  InterviewSession,
  SessionDetail,
  SearchResult,
  Form,
  FormQuestion,
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
    const raw = (body as { message?: unknown }).message;
    const msg = Array.isArray(raw)
      ? raw.join(', ')
      : typeof raw === 'string'
        ? raw
        : `HTTP ${res.status}`;
    throw new Error(msg);
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

// ── Interview mutations ───────────────────────────────────────────────────────

export async function createInterview(dto: {
  title: string;
  type?: string;
  objective: string;
  context?: string;
  aiPersona?: string;
  maxTurns?: number;
}): Promise<Interview> {
  return request<Interview>('/interviews', { method: 'POST', body: JSON.stringify(dto) });
}

export async function updateInterview(
  id: string,
  dto: { title?: string; objective?: string; context?: string; aiPersona?: string; maxTurns?: number },
): Promise<Interview> {
  return request<Interview>(`/interviews/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

export async function activateInterview(id: string): Promise<Interview> {
  return request<Interview>(`/interviews/${id}/activate`, { method: 'POST' });
}

export async function closeInterview(id: string): Promise<Interview> {
  return request<Interview>(`/interviews/${id}/close`, { method: 'POST' });
}

export async function deleteInterview(id: string): Promise<void> {
  return request<void>(`/interviews/${id}`, { method: 'DELETE' });
}

export async function addInterviewField(
  id: string,
  dto: {
    fieldName: string;
    displayName: string;
    fieldType: string;
    description: string;
    isRequired?: boolean;
    orderIndex: number;
  },
): Promise<InterviewField> {
  return request<InterviewField>(`/interviews/${id}/fields`, { method: 'POST', body: JSON.stringify(dto) });
}

export async function removeInterviewField(id: string, fieldId: string): Promise<void> {
  return request<void>(`/interviews/${id}/fields/${fieldId}`, { method: 'DELETE' });
}

// ── Form mutations ────────────────────────────────────────────────────────────

export async function createForm(dto: { title: string; description?: string }): Promise<Form> {
  return request<Form>('/forms', { method: 'POST', body: JSON.stringify(dto) });
}

export async function addFormQuestion(
  formId: string,
  dto: { text: string; type: string; options?: string[] },
): Promise<FormQuestion> {
  return request<FormQuestion>(`/forms/${formId}/questions`, { method: 'POST', body: JSON.stringify(dto) });
}

export async function deleteFormQuestion(formId: string, questionId: string): Promise<void> {
  return request<void>(`/forms/${formId}/questions/${questionId}`, { method: 'DELETE' });
}

export async function activateForm(id: string): Promise<Form> {
  return request<Form>(`/forms/${id}/activate`, { method: 'POST' });
}
