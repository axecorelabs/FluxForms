'use client';

import { getToken, clearToken } from './auth';
import type {
  Interview,
  InterviewStats,
  InterviewSession,
  SessionDetail,
  SearchResult,
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

export async function exchangeMagicToken(token: string): Promise<{ accessToken: string }> {
  return request<{ accessToken: string }>('/auth/dashboard/exchange', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
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

export async function searchSessions(
  interviewId: string,
  query: string,
): Promise<{ results: SearchResult[] }> {
  const params = new URLSearchParams({ q: query });
  return request<{ results: SearchResult[] }>(`/interviews/${interviewId}/search?${params}`);
}
