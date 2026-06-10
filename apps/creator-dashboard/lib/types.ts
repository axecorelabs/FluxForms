export interface Interview {
  id: string;
  title: string;
  type: string;
  objective: string;
  context: string | null;
  aiPersona: string | null;
  maxTurns: number;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
  completedCount: number;
  shareLink: string | null;
  createdAt: string;
  schemaFields: InterviewField[];
}

export interface InterviewField {
  id: string;
  fieldName: string;
  displayName: string;
  fieldType: string;
  description: string;
  isRequired: boolean;
  orderIndex: number;
}

export interface InterviewStats {
  total: number;
  completed: number;
  active: number;
  interrupted: number;
}

export interface InterviewSession {
  id: string;
  interviewId: string;
  userTelegramId: string;
  state: 'ACTIVE' | 'COMPLETED' | 'INTERRUPTED';
  turnCount: number;
  startedAt: string;
  completedAt: string | null;
  summary?: string | null;
  extractionStatus?: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  extractionError?: string | null;
  _count?: { messages: number };
  extractedProfile?: ExtractedEntity[];
}

export interface SessionDetail extends InterviewSession {
  messages: InterviewMessage[];
  extractedProfile: ExtractedEntity[];
  interview: Interview;
}

export interface InterviewMessage {
  id: string;
  sessionId: string;
  role: 'USER' | 'AI' | 'SYSTEM';
  content: string;
  turnIndex: number;
  createdAt: string;
}

export interface ExtractedEntity {
  id: string;
  sessionId: string;
  fieldName: string;
  value: unknown;
  confidence: number;
  lastUpdatedTurn: number;
}

export interface FormQuestion {
  id: string;
  text: string;
  type: string;
  orderIndex: number;
}

export interface Form {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PAYMENT_PENDING' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
  shareLink: string | null;
  createdAt: string;
  questions: FormQuestion[];
  _count?: { responses: number; questions?: number };
}

export interface FormResponse {
  id: string;
  formId: string;
  sessionId: string;
  answers: Record<string, string>;
  status: string;
  submittedAt: string | null;
}

export interface FormResponsesPage {
  responses: FormResponse[];
  total: number;
  page: number;
  totalPages: number;
}

export interface OverviewData {
  totalForms: number;
  activeForms: number;
  totalResponses: number;
  responseTrend: Array<{ date: string; count: number }>;
  totalInterviews: number;
  activeInterviews: number;
  totalCompletions: number;
  recentForms: Array<{
    id: string;
    title: string;
    status: string;
    _count: { responses: number; questions: number };
  }>;
  recentInterviews: Array<{
    id: string;
    title: string;
    status: string;
    type: string;
    completedCount: number;
    schemaFields: Array<{ fieldName: string }>;
  }>;
}

export interface FormsPage {
  forms: Form[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SearchResult {
  id: string;
  userTelegramId: string;
  completedAt: string | null;
  similarity: number;
}
