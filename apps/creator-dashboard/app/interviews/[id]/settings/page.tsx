'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ChevronLeft, Plus, Trash2, Save } from 'lucide-react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import {
  getInterview,
  updateInterview,
  addInterviewField,
  removeInterviewField,
} from '@/lib/api';
import type { Interview, InterviewField } from '@/lib/types';

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

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6,
  display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em',
};

const sectionStyle: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 12, padding: '20px 24px', marginBottom: 16,
};

interface DraftField {
  key: string;
  existing?: InterviewField;
  fieldName: string;
  displayName: string;
  fieldType: string;
  description: string;
  isRequired: boolean;
  deleted?: boolean;
}

let fk = 0;
function nk() { return `new-${fk++}`; }

export default function InterviewSettingsPage() {
  const { id } = useParams<{ id: string }>();

  const [interview, setInterview] = useState<Interview | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [type, setType] = useState('CUSTOM');
  const [objective, setObjective] = useState('');
  const [context, setContext] = useState('');
  const [aiPersona, setAiPersona] = useState('');
  const [maxTurns, setMaxTurns] = useState(20);
  const [fields, setFields] = useState<DraftField[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isDraft = interview?.status === 'DRAFT';

  useEffect(() => {
    getInterview(id)
      .then(iv => {
        setInterview(iv);
        setTitle(iv.title);
        setType(iv.type);
        setObjective(iv.objective);
        setContext(iv.context ?? '');
        setAiPersona(iv.aiPersona ?? '');
        setMaxTurns(iv.maxTurns);
        setFields(iv.schemaFields.map(f => ({
          key: f.id,
          existing: f,
          fieldName: f.fieldName,
          displayName: f.displayName,
          fieldType: f.fieldType,
          description: f.description,
          isRequired: f.isRequired,
        })));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function updateField(key: string, patch: Partial<DraftField>) {
    setFields(fs => fs.map(f => f.key === key ? { ...f, ...patch } : f));
  }

  function removeField(key: string) {
    setFields(fs => fs.map(f => f.key === key ? { ...f, deleted: true } : f));
  }

  function addField() {
    setFields(fs => [...fs, {
      key: nk(), fieldName: '', displayName: '', fieldType: 'TEXT', description: '', isRequired: false,
    }]);
  }

  async function save() {
    setError(null); setSaving(true); setSaved(false);
    try {
      await updateInterview(id, {
        title: title.trim(),
        objective: objective.trim(),
        context: context.trim() || undefined,
        aiPersona: aiPersona.trim() || undefined,
        maxTurns,
      });

      if (isDraft) {
        // Remove deleted existing fields
        for (const f of fields.filter(f => f.deleted && f.existing)) {
          await removeInterviewField(id, f.existing!.id);
        }
        // Add new fields
        const newFields = fields.filter(f => !f.deleted && !f.existing && f.fieldName.trim() && f.displayName.trim());
        for (let i = 0; i < newFields.length; i++) {
          const f = newFields[i];
          await addInterviewField(id, {
            fieldName: f.fieldName.trim(),
            displayName: f.displayName.trim(),
            fieldType: f.fieldType,
            description: f.description.trim(),
            isRequired: f.isRequired,
            orderIndex: (interview?.schemaFields.length ?? 0) + i,
          });
        }
        // Reload to get fresh field IDs
        const fresh = await getInterview(id);
        setInterview(fresh);
        setFields(fresh.schemaFields.map(sf => ({
          key: sf.id, existing: sf,
          fieldName: sf.fieldName, displayName: sf.displayName,
          fieldType: sf.fieldType, description: sf.description, isRequired: sf.isRequired,
        })));
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  if (loading) return (
    <DashboardLayout>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
    </DashboardLayout>
  );

  const visibleFields = fields.filter(f => !f.deleted);

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href={`/interviews/${id}`} style={{ textDecoration: 'none', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}>
            <ChevronLeft size={16} />
          </Link>
          <div style={{ flex: 1 }}>
            <h1 className="brand-heading" style={{ fontSize: 20, color: 'var(--text)', margin: 0 }}>Settings</h1>
            {interview && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>{interview.title}</p>
            )}
          </div>
          <button
            disabled={saving}
            onClick={save}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: saved ? 'rgba(52,211,153,0.15)' : 'var(--accent)',
              color: saved ? 'var(--success)' : '#fff', border: 'none',
              borderRadius: 10, padding: '8px 18px', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1, transition: 'all 0.2s',
            }}
          >
            <Save size={13} />
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </button>
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
            <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                disabled={!isDraft}
              >
                {INTERVIEW_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {!isDraft && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Type is locked after activation.</p>}
            </div>
            <div>
              <label style={labelStyle}>Max turns &nbsp;<span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>{maxTurns}</span></label>
              <input type="range" min={8} max={40} step={2} value={maxTurns}
                onChange={e => setMaxTurns(Number(e.target.value))}
                style={{ width: '100%', marginTop: 10, accentColor: 'var(--accent)' }} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Objective</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
              value={objective} onChange={e => setObjective(e.target.value)} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Context <span style={{ fontWeight: 400, textTransform: 'none' }}>— optional</span></label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
              value={context} onChange={e => setContext(e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>AI Persona <span style={{ fontWeight: 400, textTransform: 'none' }}>— optional</span></label>
            <input style={inputStyle} value={aiPersona} onChange={e => setAiPersona(e.target.value)}
              placeholder="e.g. Alex, a direct but friendly technical recruiter" />
          </div>
        </div>

        {/* Schema fields */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
              Schema Fields
            </p>
            {!isDraft && (
              <span style={{ fontSize: 11, color: 'var(--warning)', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 6, padding: '2px 8px' }}>
                Read-only — close &amp; re-draft to edit fields
              </span>
            )}
          </div>

          {visibleFields.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>No fields defined yet.</p>
          )}

          {visibleFields.map(f => (
            <div key={f.key} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 4 }}>Field name</label>
                  <input style={{ ...inputStyle, opacity: (f.existing || !isDraft) ? 0.7 : 1 }}
                    value={f.fieldName}
                    readOnly={!!f.existing || !isDraft}
                    onChange={e => updateField(f.key, { fieldName: e.target.value.replace(/\s/g, '_').toLowerCase() })} />
                </div>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 4 }}>Display name</label>
                  <input style={{ ...inputStyle, opacity: !isDraft ? 0.7 : 1 }}
                    value={f.displayName}
                    readOnly={!isDraft}
                    onChange={e => updateField(f.key, { displayName: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 4 }}>Type</label>
                  <select value={f.fieldType}
                    disabled={!!f.existing || !isDraft}
                    onChange={e => updateField(f.key, { fieldType: e.target.value })}
                    style={{ ...inputStyle, appearance: 'none', cursor: isDraft && !f.existing ? 'pointer' : 'default', opacity: (f.existing || !isDraft) ? 0.7 : 1 }}>
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 4 }}>Description</label>
                  <input style={{ ...inputStyle, opacity: !isDraft ? 0.7 : 1 }}
                    value={f.description}
                    readOnly={!isDraft}
                    onChange={e => updateField(f.key, { description: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-secondary)', cursor: isDraft ? 'pointer' : 'default' }}>
                  <input type="checkbox" checked={f.isRequired}
                    disabled={!isDraft}
                    onChange={e => updateField(f.key, { isRequired: e.target.checked })}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                  Required
                </label>
                {isDraft && (
                  <button onClick={() => removeField(f.key)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}

          {isDraft && (
            <button onClick={addField}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'none',
                border: '1px dashed var(--border)', borderRadius: 8, padding: '7px 14px',
                cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)',
                fontFamily: 'inherit', width: '100%', justifyContent: 'center',
              }}>
              <Plus size={13} strokeWidth={2.5} /> Add field
            </button>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
