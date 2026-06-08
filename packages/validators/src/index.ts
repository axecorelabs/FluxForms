import { z } from 'zod';

export const createFormSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title must be at most 100 characters').trim(),
  description: z.string().max(500).trim().optional(),
});

export const createQuestionSchema = z.object({
  text: z.string().min(3, 'Question must be at least 3 characters').max(300, 'Question must be at most 300 characters').trim(),
  type: z.enum(['TEXT', 'NUMBER', 'EMAIL', 'YES_NO', 'MULTIPLE_CHOICE']),
  options: z.array(z.string().min(1).max(100)).min(2, 'Multiple choice needs at least 2 options').max(10).optional(),
  isRequired: z.boolean().default(true),
});

export const submitAnswerSchema = z.object({
  sessionId: z.string().cuid(),
  value: z.string().max(2000),
});

export const updateFormStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'CLOSED', 'ARCHIVED']),
});

export type CreateFormInput = z.infer<typeof createFormSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
