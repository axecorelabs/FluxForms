'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ChevronLeft, X } from 'lucide-react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { createForm, addFormQuestion, activateForm } from '@/lib/api';

const QUESTION_TYPES = [
  { value: 'TEXT', label: 'Text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'YES_NO', label: 'Yes / No' },
  { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
];

interface DraftQuestion {
  key: string;
  text: string;
  type: string;
  options: string[];
  newOption: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 6,
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const sectionStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '20px 24px',
  marginBottom: 16,
};

let qKey = 0;
function nextKey() { return String(qKey++); }

function emptyQuestion(): DraftQuestion {
  return { key: nextKey(), text: '', type: 'TEXT', options: [], newOption: '' };
}

export default function NewFormPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateQ(key: string, patch: Partial<DraftQuestion>) {
    setQuestions(qs => qs.map(q => q.key === key ? { ...q, ...patch } : q));
  }

  function removeQ(key: string) {
    setQuestions(qs => qs.filter(q => q.key !== key));
  }

  function addOption(key: string) {
    setQuestions(qs => qs.map(q => {
      if (q.key !== key) return q;
      const val = q.newOption.trim();
      if (!val || q.options.includes(val)) return { ...q, newOption: '' };
      return { ...q, options: [...q.options, val], newOption: '' };
    }));
  }

  function removeOption(key: string, opt: string) {
    setQuestions(qs => qs.map(q =>
      q.key === key ? { ...q, options: q.options.filter(o => o !== opt) } : q,
    ));
  }

  async function submit(activate: boolean) {
    setError(null);

    if (!title.trim()) { setError('Title is required.'); return; }

    const validQuestions = questions.filter(q => q.text.trim());
    if (validQuestions.length === 0) { setError('Add at least one question.'); return; }

    for (const q of validQuestions) {
      if (q.type === 'MULTIPLE_CHOICE' && q.options.length < 2) {
        setError(`"${q.text.slice(0, 40)}" needs at least 2 options.`);
        return;
      }
    }

    setSaving(true);
    try {
      const form = await createForm({ title: title.trim(), description: description.trim() || undefined });

      for (const q of validQuestions) {
        await addFormQuestion(form.id, {
          text: q.text.trim(),
          type: q.type,
          options: q.type === 'MULTIPLE_CHOICE' ? q.options : undefined,
        });
      }

      if (activate) {
        await activateForm(form.id);
      }

      router.push(`/forms/${form.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/forms" style={{ textDecoration: 'none', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}>
            <ChevronLeft size={16} />
          </Link>
          <h1 className="brand-heading" style={{ fontSize: 20, color: 'var(--text)', margin: 0 }}>
            New Form
          </h1>
        </div>

        {error && (
          <div style={{ color: 'var(--error)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Basic info */}
        <div style={sectionStyle}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Basic Info</p>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Title</label>
            <input style={inputStyle} placeholder="e.g. Customer Satisfaction Survey" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Description <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', textTransform: 'none' }}>— optional</span></label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
              placeholder="Shown to respondents before they start filling the form."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
        </div>

        {/* Questions */}
        <div style={sectionStyle}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Questions</p>

          {questions.map((q, idx) => (
            <div
              key={q.key}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '14px 16px', marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginTop: 10, minWidth: 18, textAlign: 'right' }}>
                  {idx + 1}.
                </span>
                <div style={{ flex: 1 }}>
                  <input
                    style={inputStyle}
                    placeholder="Question text"
                    value={q.text}
                    onChange={e => updateQ(q.key, { text: e.target.value })}
                  />
                </div>
                <select
                  value={q.type}
                  onChange={e => updateQ(q.key, { type: e.target.value, options: [] })}
                  style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '8px 10px', fontSize: 12,
                    color: 'var(--text-secondary)', cursor: 'pointer',
                    outline: 'none', fontFamily: 'inherit', appearance: 'none',
                    flexShrink: 0,
                  }}
                >
                  {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {questions.length > 1 && (
                  <button
                    onClick={() => removeQ(q.key)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {q.type === 'MULTIPLE_CHOICE' && (
                <div style={{ paddingLeft: 28 }}>
                  {q.options.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {q.options.map(opt => (
                        <span
                          key={opt}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: 'var(--bg-surface)', border: '1px solid var(--border)',
                            borderRadius: 6, padding: '3px 8px', fontSize: 12, color: 'var(--text)',
                          }}
                        >
                          {opt}
                          <button
                            onClick={() => removeOption(q.key, opt)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-tertiary)' }}
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder="Add option…"
                      value={q.newOption}
                      onChange={e => updateQ(q.key, { newOption: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(q.key); } }}
                    />
                    <button
                      onClick={() => addOption(q.key)}
                      style={{
                        background: 'var(--bg-surface)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                        fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'inherit',
                        flexShrink: 0,
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <button
            onClick={() => setQuestions(qs => [...qs, emptyQuestion()])}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: '1px dashed var(--border)',
              borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
              fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'inherit',
              width: '100%', justifyContent: 'center',
            }}
          >
            <Plus size={13} strokeWidth={2.5} />
            Add question
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingBottom: 40 }}>
          <button
            disabled={saving}
            onClick={() => submit(false)}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '9px 20px', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 13, color: 'var(--text)', fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}
          >
            Save as Draft
          </button>
          <button
            disabled={saving}
            onClick={() => submit(true)}
            style={{
              background: 'var(--accent)', border: 'none',
              borderRadius: 10, padding: '9px 20px', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Creating…' : 'Create & Activate'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
