import { z } from 'zod';
import { config } from '../../config/env';

export const MAX_TEXT_LENGTH = 4000;

// V1 client-side advisory caps (byte enforcement lands with uploads, Phase 11).
const MEDIA_RULES = {
  IMAGE: { mimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], maxBytes: 10_000_000 },
  VIDEO: { mimes: ['video/mp4', 'video/webm'], maxBytes: 100_000_000 },
  FILE: {
    mimes: ['application/pdf', 'text/plain', 'application/zip', 'application/msword'],
    maxBytes: 50_000_000,
  },
} as const;

const baseFields = {
  clientMessageId: z.string().uuid(),
  replyToMessageId: z.string().uuid().optional(),
};

const textMessageSchema = z.object({
  type: z.literal('TEXT'),
  content: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
  ...baseFields,
});

const mediaMessageSchema = z.object({
  type: z.enum(['IMAGE', 'VIDEO', 'FILE']),
  // Production serves media over HTTPS only; plain HTTP is tolerated in
  // development/test so local uploads (http://localhost:...) keep working.
  mediaUrl: z
    .string()
    .url()
    .max(2048)
    .refine((v) => (config.isProduction ? v.startsWith('https://') : /^https?:\/\//.test(v)), {
      message: 'Media URL must use HTTPS',
    }),
  mimeType: z.string().max(128),
  sizeBytes: z.number().int().positive(),
  fileName: z.string().min(1).max(255).optional(),
  ...baseFields,
});

export const sendMessageSchema = z
  .discriminatedUnion('type', [textMessageSchema, mediaMessageSchema])
  .superRefine((v, ctx) => {
    if (v.type === 'TEXT') return;
    const rules = MEDIA_RULES[v.type] as { mimes: readonly string[]; maxBytes: number };
    if (!rules.mimes.includes(v.mimeType)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unsupported media type for ${v.type}` });
    }
    if (v.sizeBytes > rules.maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${v.type} messages are limited to ${rules.maxBytes} bytes`,
      });
    }
  });

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
});

export const messageStatusSchema = z.object({
  status: z.enum(['DELIVERED', 'READ']),
});

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(512).optional(),
});

export const conversationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const messageIdParamSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
});
