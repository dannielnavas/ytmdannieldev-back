import { SetMetadata } from '@nestjs/common';
import { ERoles } from '../models/roles.model.js';

export const ROLE_KEY = 'roles';
export const Roles = (...roles: ERoles[]) => SetMetadata(ROLE_KEY, roles);
