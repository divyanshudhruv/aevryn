import type { z } from "zod";

export type CapabilityFailureClass = "retryable" | "recoverable" | "fatal";

export interface CapabilityProvider {
	id: string;
	operation?: string;
	requestId?: string;
	durationMs?: number;
}

export interface CapabilitySuccess {
	ok: true;
	data: unknown;
	provider?: CapabilityProvider;
}

export interface CapabilityFailure {
	ok: false;
	error: {
		code: string;
		message: string;
		failureClass: CapabilityFailureClass;
		retryable: boolean;
	};
	provider?: CapabilityProvider;
}

export type CapabilityResult = CapabilitySuccess | CapabilityFailure;

export interface Capability {
	name: string;
	description: string;
	inputSchema: z.ZodType;
	outputSchema?: z.ZodType;
	requiresApproval?: boolean;
	execute(input: unknown): Promise<CapabilityResult>;
}

export class CapabilityRegistry {
	private readonly capabilities = new Map<string, Capability>();

	register(capability: Capability): void {
		if (this.capabilities.has(capability.name)) {
			throw new Error(`Capability "${capability.name}" already registered`);
		}
		this.capabilities.set(capability.name, capability);
	}

	get(name: string): Capability | undefined {
		return this.capabilities.get(name);
	}

	list(): Capability[] {
		return [...this.capabilities.values()];
	}
}
