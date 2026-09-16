import type { ToolSet } from "ai";

import {
	ANAKIN_BASE_URL,
	anakinClient,
	requireKey,
	resolveAnakinKey,
	type ToolError,
	type ToolResult,
} from "./anakin-client";
import { aiVisibilityTool } from "./ai-visibility";
import { aiVisibilitySearchesTool } from "./ai-visibility-searches";
import { aiVisibilityRetryTool } from "./ai-visibility-retry";
import { aiVisibilitySourcesTool } from "./ai-visibility-sources";
import { beginTaskTool } from "./begin-task";
import {
	browserSessionCreate,
	browserSessionDelete,
	browserSessionList,
	browserSessionRename,
} from "./browser-sessions";
import {
	askUserQuestionSchema,
	askUserTool,
	presentPlanTool,
} from "./client";
import { crawlSiteTool } from "./crawl-site";
import { mapSiteTool } from "./map-site";
import { searchMemoryTool, storeMemoryTool } from "./memory";
import { researchTopicTool } from "./research-topic";
import { makeRetryAgentTool } from "./retry-agent";
import { scrapeBatchTool } from "./scrape-batch";
import { scrapeUrlTool } from "./scrape-url";
import { searchWebTool } from "./search-web";
import { wireActionTool } from "./wire-action";
import { wireBuildRequestTool } from "./wire-build-request";
import { wireBuildRequestsTool } from "./wire-build-requests";
import { wireCatalogTool } from "./wire-catalog";
import { wireDiscoverTool } from "./wire-discover";
import { wireDownloadTool } from "./wire-download";
import { updateStepStatusTool } from "./workflow-progress";

export { toolContextSchema, type ToolContext } from "./context";
export {
	ANAKIN_BASE_URL,
	anakinClient,
	requireKey,
	resolveAnakinKey,
	type ToolError,
	type ToolResult,
};
export { beginTaskTool };
export { browserSessionCreate, browserSessionDelete, browserSessionList, browserSessionRename };
export { askUserQuestionSchema, askUserTool, presentPlanTool };
export { crawlSiteTool };
export { mapSiteTool };
export { searchMemoryTool, storeMemoryTool };
export { researchTopicTool };
export { makeRetryAgentTool };
export { scrapeBatchTool };
export { scrapeUrlTool };
export { searchWebTool };
export { wireActionTool };
export { wireBuildRequestTool };
export { wireBuildRequestsTool };
export { wireCatalogTool };
export { wireDiscoverTool };
export { wireDownloadTool };
export { updateStepStatusTool };
export { aiVisibilityTool };
export { aiVisibilitySourcesTool };
export { aiVisibilitySearchesTool };
export { aiVisibilityRetryTool };

// Client tools (askUserTool, presentPlanTool) and updateStepStatusTool are
// intentionally NOT in the default set — AgentService registers them
// conditionally per mode (run vs chat).
export const anakinToolSet = {
	searchWeb: searchWebTool,
	scrapeUrl: scrapeUrlTool,
	scrapeBatch: scrapeBatchTool,
	crawlSite: crawlSiteTool,
	mapSite: mapSiteTool,
	researchTopic: researchTopicTool,
	wireDiscover: wireDiscoverTool,
	wireAction: wireActionTool,
	wireBuildRequest: wireBuildRequestTool,
	aiVisibility: aiVisibilityTool,
	aiVisibilitySources: aiVisibilitySourcesTool,
	aiVisibilitySearches: aiVisibilitySearchesTool,
	aiVisibilityRetry: aiVisibilityRetryTool,
	wireCatalog: wireCatalogTool,
	wireBuildRequests: wireBuildRequestsTool,
	wireDownload: wireDownloadTool,
	browserSessionList,
	browserSessionCreate,
	browserSessionRename,
	browserSessionDelete,
	storeMemory: storeMemoryTool,
	searchMemory: searchMemoryTool,
} satisfies ToolSet;

export type AnakinToolSet = typeof anakinToolSet;