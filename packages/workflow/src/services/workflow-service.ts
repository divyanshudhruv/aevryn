import { db, workflows, type Db, type Workflow } from "@aevryn/db";
import { eq } from "drizzle-orm";

export class WorkflowService {
	constructor(private readonly client: Db = db) {}

	private scope(): Db {
		return this.client;
	}

	async findById(id: string): Promise<Workflow | undefined> {
		return this.scope().query.workflows.findFirst({
			where: eq(workflows.id, id),
		});
	}
}