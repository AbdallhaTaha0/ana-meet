import { z } from 'zod';
import { config } from '../../config/env';
import { pageQuerySchema } from '../blocks/blocks.schemas';

// V1 client-side advisory caps (byte enforcement lands with uploads, Phase 11).
const STORY_MEDIA_RULES = {
  IMAGE: { mimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], maxBytes: 10_000_000 },
  VIDEO: { mimes: ['video/mp4', 'video/webm'], maxBytes: 100_000_000 },
} as const;

const textStorySchema = z.object({
  type: z.literal('TEXT'),
  content: z.string().trim().min(1).max(500),
});

const mediaStorySchema = z.object({
  type: z.enum(['IMAGE', 'VIDEO']),
  mediaUrl: z
    .string()
    .url()
    .max(2048)
    .refine((v) => (config.isProduction ? v.startsWith('https://') : /^https?:\/\//.test(v)), {
      message: 'Media URL must use HTTPS',
    }),
  mimeType: z.string().max(128),
  sizeBytes: z.number().int().positive(),
  // Optional caption so text + image/video is a single story, never two.
  content: z.string().trim().max(500).optional(),
});

export const createStorySchema = z
  .discriminatedUnion('type', [textStorySchema, mediaStorySchema])
  .superRefine((v, ctx) => {
    if (v.type === 'TEXT') return;
    const rules = STORY_MEDIA_RULES[v.type] as { mimes: readonly string[]; maxBytes: number };
    if (!rules.mimes.includes(v.mimeType)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unsupported media type for ${v.type}` });
    }
    if (v.sizeBytes > rules.maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${v.type} stories are limited to ${rules.maxBytes} bytes`,
      });
    }
  });

export type CreateStoryInput = z.infer<typeof createStorySchema>;

export const storiesQuerySchema = pageQuerySchema;

export const storyOwnerParamSchema = z.object({
  userId: z.string().uuid(),
});

export const storyIdParamSchema = z.object({
  storyId: z.string().uuid(),
});
