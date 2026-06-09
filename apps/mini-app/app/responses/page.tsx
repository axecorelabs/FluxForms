'use client';

import { useEffect, useState } from 'react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Telegram?: { WebApp: any };
  }
}

interface Question { id: string; text: string; type: string }
interface FormMeta { id: string; title: string; questions: Question[] }
interface Response { id: string; answers: Record<string, string>; submittedAt: string | null }
interface PageData { form: FormMeta; responses: Response[]; total: number; page: number; totalPages: number }

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function exportCsv(formId: string, token: string) {
  const url = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/miniapp/forms/${formId}/responses.csv?token=${encodeURIComponent(token)}`;
  window.Telegram?.WebApp.openLink(url);
}

export default function ResponsesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<PageData | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const formId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('formId') ?? ''
    : '';

  // Step 1: authenticate with Telegram initData
  useEffect(() => {
    const tgApp = window.Telegram?.WebApp;
    if (!tgApp) {
      setError('Open this page inside Telegram.');
      setLoading(false);
      return;
    }
    tgApp.ready();
    tgApp.expand();

    const initData = tgApp.initData as string;
    if (!initData) {
      setError('No Telegram session data found.');
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/miniapp/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(new Error((b as { message?: string }).message ?? `HTTP ${r.status}`))))
      .then((body: { accessToken: string }) => setToken(body.accessToken))
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Step 2: load responses once we have a token and formId
  useEffect(() => {
    if (!token || !formId) return;
    setLoading(true);
    fetch(`${API_BASE}/miniapp/forms/${formId}/responses?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(new Error((b as { message?: string }).message ?? `HTTP ${r.status}`))))
      .then((body: PageData) => setData(body))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, formId, page]);

  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-white">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-red-600 text-center text-sm">{error}</p>
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading…</div>
      </main>
    );
  }

  const { form, responses, total, totalPages } = data;

  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 bg-white z-10">
        <div>
          <div className="font-semibold text-gray-900 text-sm leading-tight">{form.title}</div>
          <div className="text-xs text-gray-400 mt-0.5">{total} response{total !== 1 ? 's' : ''}</div>
        </div>
        {responses.length > 0 && token && (
          <button
            onClick={() => exportCsv(form.id, token)}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium"
          >
            Export CSV
          </button>
        )}
      </div>

      {/* Content */}
      {responses.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          No responses yet.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 text-xs text-gray-500 font-semibold whitespace-nowrap border-b border-gray-100">#</th>
                <th className="text-left px-3 py-2 text-xs text-gray-500 font-semibold whitespace-nowrap border-b border-gray-100">Time</th>
                {form.questions.map(q => (
                  <th key={q.id} className="text-left px-3 py-2 text-xs text-gray-500 font-semibold border-b border-gray-100 max-w-[140px]">
                    {q.text}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {responses.map((r, i) => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="px-3 py-2 text-gray-400 text-xs">{(page - 1) * 50 + i + 1}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">
                    {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'}
                  </td>
                  {form.questions.map(q => (
                    <td key={q.id} className="px-3 py-2 text-gray-800 max-w-[160px] break-words">
                      {r.answers[q.id] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="text-sm px-4 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-400">{page} / {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="text-sm px-4 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </main>
  );
}
