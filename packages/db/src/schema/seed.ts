import { eq } from "drizzle-orm";
import { globalSettings } from "./global-settings";

export type DefaultGlobalSettings = {
  /** Raw JSON string stored in `settings`. Always a valid JSON object. */
  settings: string;
};

const DEFAULT_SETTINGS_JSON = JSON.stringify({
  version: 1,
  instructions: "",
  prompts: [],
  autoApproveClasses: [],
  scheduleDefaults: null,
  notificationPreferences: {
    workflow: true,
    run: true,
    system: true,
    security: true,
    webhook: false,
  },
  commandMenuDefaults: {
    suggestions: [],
  },
});

const MAX_WORKSPACE_ID_SLICE = 12;

function makeStableSettingsId(workspaceId: string): string {
  return `gs_${workspaceId.slice(0, MAX_WORKSPACE_ID_SLICE)}`;
}

export async function upsertDefaultGlobalSettings(
  client: any,
  workspaceId: string,
  userId: string,
): Promise<void> {
  if (workspaceId.length === 0) {
    return;
  }
  const id = makeStableSettingsId(workspaceId);
  await client
    .insert(globalSettings)
    .values({
      id,
      workspaceId,
      userId,
      settings: DEFAULT_SETTINGS_JSON,
    })
    .onConflictDoNothing();
}

export async function getGlobalSettings(
  client: any,
  workspaceId: string,
): Promise<{ workspaceId: string; settings: string } | undefined> {
  const rows = await client.query.globalSettings.findMany({
    where: eq(globalSettings.workspaceId, workspaceId),
    columns: { workspaceId: true, settings: true },
  });
  return rows[0];
}
