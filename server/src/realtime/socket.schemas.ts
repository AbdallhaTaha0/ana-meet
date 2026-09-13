import { z } from 'zod';
import { sendMessageSchema } from '../modules/messages/messages.schemas';

// Every socket payload is Zod-validated like REST bodies. Acks follow the
// REST error shape: { ok: true, ... } or { error: { code, message } }.

export const messageSendSocketSchema = z.object({
  conversationId: z.string().uuid(),
  message: sendMessageSchema,
});

export const messageEditSocketSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
});

export const messageDeleteSocketSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
});

export const messageStatusSocketSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  status: z.enum(['DELIVERED', 'READ']),
});

export const typingSocketSchema = z.object({
  conversationId: z.string().uuid(),
});
