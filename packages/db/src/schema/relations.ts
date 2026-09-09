import { relations } from "drizzle-orm";
import { agentState } from "./agent-state";
import { approval } from "./approval";
import { account, session, user } from "./auth";
import { event } from "./event";
import { notification } from "./notification";
import { observation } from "./observation";
import { recoveryAttempt } from "./recovery-attempt";
import { schedule } from "./schedule";
import { toolExecution } from "./tool-execution";
import { webhookBoard } from "./webhook-board";
import { workflow } from "./workflow";
import { workflowExecution } from "./workflow-execution";
import { workflowStep } from "./workflow-step";

export const workflowRelations = relations(workflow, ({ one, many }) => ({
	user: one(user, {
		fields: [workflow.userId],
		references: [user.id],
	}),
	executions: many(workflowExecution),
	agentStates: many(agentState),
	observations: many(observation),
	toolExecutions: many(toolExecution),
	recoveryAttempts: many(recoveryAttempt),
	events: many(event),
	schedules: many(schedule),
	notifications: many(notification),
	webhooks: many(webhookBoard),
	approvals: many(approval),
}));

export const webhookBoardRelations = relations(webhookBoard, ({ one }) => ({
	workflow: one(workflow, {
		fields: [webhookBoard.workflowId],
		references: [workflow.id],
	}),
	execution: one(workflowExecution, {
		fields: [webhookBoard.executionId],
		references: [workflowExecution.id],
	}),
}));

export const workflowExecutionRelations = relations(
	workflowExecution,
	({ one, many }) => ({
		workflow: one(workflow, {
			fields: [workflowExecution.workflowId],
			references: [workflow.id],
		}),
		steps: many(workflowStep),
		toolExecutions: many(toolExecution),
		recoveryAttempts: many(recoveryAttempt),
		events: many(event),
		webhooks: many(webhookBoard),
		approvals: many(approval),
	}),
);

export const workflowStepRelations = relations(
	workflowStep,
	({ one, many }) => ({
		execution: one(workflowExecution, {
			fields: [workflowStep.executionId],
			references: [workflowExecution.id],
		}),
		toolExecutions: many(toolExecution),
		recoveryAttempts: many(recoveryAttempt),
	}),
);

export const agentStateRelations = relations(agentState, ({ one }) => ({
	workflow: one(workflow, {
		fields: [agentState.workflowId],
		references: [workflow.id],
	}),
}));

export const observationRelations = relations(observation, ({ one }) => ({
	workflow: one(workflow, {
		fields: [observation.workflowId],
		references: [workflow.id],
	}),
}));

export const toolExecutionRelations = relations(toolExecution, ({ one }) => ({
	workflow: one(workflow, {
		fields: [toolExecution.workflowId],
		references: [workflow.id],
	}),
	execution: one(workflowExecution, {
		fields: [toolExecution.executionId],
		references: [workflowExecution.id],
	}),
	step: one(workflowStep, {
		fields: [toolExecution.stepId],
		references: [workflowStep.id],
	}),
}));

export const recoveryAttemptRelations = relations(
	recoveryAttempt,
	({ one }) => ({
		workflow: one(workflow, {
			fields: [recoveryAttempt.workflowId],
			references: [workflow.id],
		}),
		execution: one(workflowExecution, {
			fields: [recoveryAttempt.executionId],
			references: [workflowExecution.id],
		}),
		step: one(workflowStep, {
			fields: [recoveryAttempt.stepId],
			references: [workflowStep.id],
		}),
	}),
);

export const eventRelations = relations(event, ({ one }) => ({
	workflow: one(workflow, {
		fields: [event.workflowId],
		references: [workflow.id],
	}),
	execution: one(workflowExecution, {
		fields: [event.executionId],
		references: [workflowExecution.id],
	}),
}));

export const scheduleRelations = relations(schedule, ({ one }) => ({
	workflow: one(workflow, {
		fields: [schedule.workflowId],
		references: [workflow.id],
	}),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
	workflow: one(workflow, {
		fields: [notification.workflowId],
		references: [workflow.id],
	}),
	user: one(user, {
		fields: [notification.userId],
		references: [user.id],
	}),
}));

export const userRelations = relations(user, ({ many }) => ({
	workflows: many(workflow),
	notifications: many(notification),
	approvals: many(approval),
}));

export const approvalRelations = relations(approval, ({ one }) => ({
	workflow: one(workflow, {
		fields: [approval.workflowId],
		references: [workflow.id],
	}),
	execution: one(workflowExecution, {
		fields: [approval.executionId],
		references: [workflowExecution.id],
	}),
	user: one(user, {
		fields: [approval.userId],
		references: [user.id],
	}),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));
