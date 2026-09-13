import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { Errors } from '../../common/errors';
import { addContact, listContacts, removeContact } from './contacts.service';

export const add = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  const { contact, created } = await addContact(req.auth.userId, req.body.contactUserId as string);
  res.status(created ? 201 : 200).json({ contact });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  const query = req.query as unknown as { limit: number; offset: number };
  const result = await listContacts(req.auth.userId, query.limit, query.offset);
  res.status(200).json({ ...result, limit: query.limit, offset: query.offset });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  const params = req.params as unknown as { contactUserId: string };
  await removeContact(req.auth.userId, params.contactUserId);
  res.status(204).send();
});
