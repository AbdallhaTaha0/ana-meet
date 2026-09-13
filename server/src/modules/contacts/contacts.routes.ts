import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import { pageQuerySchema } from '../blocks/blocks.schemas';
import { add, list, remove } from './contacts.controller';
import { contactBodySchema, contactUserIdParamSchema } from './contacts.schemas';

export const contactsRoutes: Router = Router();

contactsRoutes.use(requireAuth);
contactsRoutes.get('/', validate('query', pageQuerySchema), list);
contactsRoutes.post('/', validate('body', contactBodySchema), add);
contactsRoutes.delete('/:contactUserId', validate('params', contactUserIdParamSchema), remove);
