import { z } from "zod";

import { MESSAGE_ROLES, PLAN_LEVELS, RUN_STATUSES } from "../domain";

export const planLevelSchema = z.enum(PLAN_LEVELS);
export const messageRoleSchema = z.enum(MESSAGE_ROLES);
export const runStatusSchema = z.enum(RUN_STATUSES);
