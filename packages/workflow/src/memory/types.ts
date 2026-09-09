import { z } from "zod";

export const memoryCategorySchema = z.enum([
	"working",
	"episodic",
	"semantic",
	"procedural",
]);

export type MemoryCategory = z.infer<typeof memoryCategorySchema>;

export interface MemoryEntry {
	id: string;
	text: string;
	category: MemoryCategory;
	createdAt: string;
	score?: number;
	metadata?: Record<string, unknown>;
}

export interface StoreMemoryInput {
	userId: string;
	text: string;
	category?: MemoryCategory;
	workflowId?: string;
	executionId?: string;
	metadata?: Record<string, unknown>;
}

export interface SearchMemoryInput {
	userId: string;
	query: string;
	limit?: number;
	categories?: MemoryCategory[];
	threshold?: number;
}

export interface MemoryStore {
	store(input: StoreMemoryInput): Promise<{ id: string }>;
	search(input: SearchMemoryInput): Promise<MemoryEntry[]>;
	listForUser(input: {
		userId: string;
		limit?: number;
	}): Promise<MemoryEntry[]>;
	deleteAllForUser(userId: string): Promise<void>;
}
