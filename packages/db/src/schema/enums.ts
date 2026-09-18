import { pgEnum } from "drizzle-orm/pg-core";

import { MESSAGE_ROLES, PLAN_LEVELS, RUN_STATUSES } from "../domain";

export const planLevelEnum = pgEnum("plan_level", PLAN_LEVELS);
export const runStatusEnum = pgEnum("run_status", RUN_STATUSES);
export const messageRoleEnum = pgEnum("message_role", MESSAGE_ROLES);
