'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, GripVertical, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { createInterview, addInterviewField, activateInterview } from '@/lib/api';

const INTERVIEW_TYPES = [
  { value: 'HIRING', label: 'Hiring' },
  { value: 'LEAD_QUALIFICATION', label: 'Lead Qualification' },
  { value: 'CUSTOMER_FEEDBACK', label: 'Customer Feedback' },
  { value: 'CLIENT_ONBOARDING', label: 'Client Onboarding' },
  { value: 'MARKET_RESEARCH', label: 'Market Research' },
  { value: 'CUSTOM', label: 'Custom' },
];

const FIELD_TYPES = [
  { value: 'TEXT', label: 'Text' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'BOOLEAN', label: 'Yes / No' },
  { value: 'DATE', label: 'Date' },
  { value: 'ARRAY', label: 'List' },
  { value: 'RATING', label: 'Rating (1–10)' },
  { value: 'ENUM', label: 'Choice' },
];

interface DraftField {
  key: string;
  fieldName: string;
  displayName: string;
  fieldType: string;
  description: string;
  isRequired: boolean;
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

let fieldKey = 0;
function nextKey() { return String(fieldKey++); }

function emptyField(): DraftField {
  return {
    key: nextKey(),
    fieldName: '',
    displayName: '',
    fieldType: 'TEXT',
    description: '',
    isRequired: false,
  };
}

export default function NewInterviewPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [type, setType] = useState('CUSTOM');
  const [objective, setObjective] = useState('');
  const [context, setContext] = useState('');
  const [aiPersona, setAiPersona] = useState('');
  const [maxTurns, setMaxTurns] = useState(20);
  const [fields, setFields] = useState<DraftField[]>([emptyField()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(key: string, patch: Partial<DraftField>) {
    setFields(fs => fs.map(f => f.key === key ? { ...f, ...patch } : f));
  }

  function removeField(key: string) {
    setFields(fs => fs.filter(f => f.key !== key));
  }

  function addField() {
    setFields(fs => [...fs, emptyField()]);
  }

  async function submit(activate: boolean) {
    setError(null);

    if (!title.trim()) { setError('Title is required.'); return; }
    if (!objective.trim()) { setError('Objective is required.'); return; }

    const validFields = fields.filter(f => f.fieldName.trim() && f.displayName.trim());

    setSaving(true);
    try {
      const interview = await createInterview({
        title: title.trim(),
        type,
        objective: objective.trim(),
        context: context.trim() || undefined,
        aiPersona: aiPersona.trim() || undefined,
        maxTurns,
      });

      for (let i = 0; i < validFields.length; i++) {
        const f = validFields[i];
        await addInterviewField(interview.id, {
          fieldName: f.fieldName.trim(),
          displayName: f.displayName.trim(),
          fieldType: f.fieldType,
          description: f.description.trim(),
          isRequired: f.isRequired,
          orderIndex: i,
        });
      }

      if (activate) {
        await activateInterview(interview.id);
      }

      router.push(`/interviews/${interview.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/interviews" style={{ textDecoration: 'none', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}>
            <ChevronLeft size={16} />
          </Link>
          <h1 className="brand-heading" style={{ fontSize: 20, color: 'var(--text)', margin: 0 }}>
            New Interview
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
            <input style={inputStyle} placeholder="e.g. Senior Engineer Screening" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
              >
                {INTERVIEW_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                Max turns &nbsp;<span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>{maxTurns}</span>
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <span
                    onMouseEnter={e => { const t = (e.currentTarget.nextSibling as HTMLElement); if (t) t.style.display = 'block'; }}
                    onMouseLeave={e => { const t = (e.currentTarget.nextSibling as HTMLElement); if (t) t.style.display = 'none'; }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 14, height: 14, borderRadius: '50%',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)',
                      cursor: 'default', flexShrink: 0, lineHeight: 1,
                    }}
                  >?</span>
                  <span style={{
                    display: 'none', position: 'absolute', bottom: '120%', left: '50%',
                    transform: 'translateX(-50%)', width: 220,
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '8px 10px', fontSize: 11,
                    color: 'var(--text-secondary)', lineHeight: 1.5,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100,
                    fontWeight: 400, textTransform: 'none', letterSpacing: 0,
                    pointerEvents: 'none',
                  }}>
                    Each "turn" is one back-and-forth exchange. The AI sends a message, the respondent replies — that's one turn. More turns allow deeper conversations but make sessions longer.
                  </span>
                </span>
              </label>
              <input
                type="range" min={8} max={40} step={2} value={maxTurns}
                onChange={e => setMaxTurns(Number(e.target.value))}
                style={{ width: '100%', marginTop: 10, accentColor: 'var(--accent)' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Objective <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', textTransform: 'none' }}>— what should the AI achieve?</span></label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
              placeholder="e.g. Assess the candidate's technical depth in distributed systems and their past leadership experience."
              value={objective}
              onChange={e => setObjective(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Context <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', textTransform: 'none' }}>— optional background for the AI</span></label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
              placeholder="e.g. We are a fintech startup, Series A, hiring for our infrastructure team."
              value={context}
              onChange={e => setContext(e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>AI Persona <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', textTransform: 'none' }}>— optional name / tone</span></label>
            <input
              style={inputStyle}
              placeholder="e.g. Alex, a senior technical recruiter who is direct but friendly"
              value={aiPersona}
              onChange={e => setAiPersona(e.target.value)}
            />
          </div>
        </div>

        {/* Schema fields */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
              Schema Fields
              <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--text-tertiary)', textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
                what the AI extracts from the conversation
              </span>
            </p>
          </div>

          {fields.map((f) => (
            <div
              key={f.key}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '14px 16px', marginBottom: 10,
                display: 'grid', gridTemplateColumns: '16px 1fr', gap: '0 10px', alignItems: 'start',
              }}
            >
              <GripVertical size={14} color="var(--text-tertiary)" style={{ marginTop: 9 }} />
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 4 }}>Field name</label>
                    <input
                      style={inputStyle}
                      placeholder="e.g. years_experience"
                      value={f.fieldName}
                      onChange={e => updateField(f.key, { fieldName: e.target.value.replace(/\s/g, '_').toLowerCase() })}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 4 }}>Display name</label>
                    <input
                      style={inputStyle}
                      placeholder="e.g. Years of Experience"
                      value={f.displayName}
                      onChange={e => updateField(f.key, { displayName: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 4 }}>Type</label>
                    <select
                      value={f.fieldType}
                      onChange={e => updateField(f.key, { fieldType: e.target.value })}
                      style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                    >
                      {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 4 }}>Description <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— helps the AI extract accurately</span></label>
                    <input
                      style={inputStyle}
                      placeholder="e.g. Total years of professional software engineering experience"
                      value={f.description}
                      onChange={e => updateField(f.key, { description: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={f.isRequired}
                      onChange={e => updateField(f.key, { isRequired: e.target.checked })}
                      style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                    />
                    Required
                  </label>
                  {fields.length > 1 && (
                    <button
                      onClick={() => removeField(f.key)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={addField}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: '1px dashed var(--border)',
              borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
              fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'inherit',
              width: '100%', justifyContent: 'center',
            }}
          >
            <Plus size={13} strokeWidth={2.5} />
            Add field
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
