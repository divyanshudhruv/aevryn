import type { ToolSet } from "ai";
import { aiVisibilityTool } from "./ai-visibility";
import { aiVisibilityRetryTool } from "./ai-visibility-retry";
import { aiVisibilitySearchesTool } from "./ai-visibility-searches";
import { aiVisibilitySourcesTool } from "./ai-visibility-sources";
import {
	ANAKIN_BASE_URL,
	anakinClient,
	requireKey,
	resolveAnakinKey,
	type ToolError,
	type ToolResult,
} from "./anakin-client";
import { beginTaskTool } from "./begin-task";
import {
	browserSessionCreate,
	browserSessionDelete,
	browserSessionList,
	browserSessionRename,
} from "./browser-sessions";
import { askUserQuestionSchema, askUserTool, presentPlanTool } from "./client";
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

export { type ToolContext, toolContextSchema } from "./context";
export {
	ANAKIN_BASE_URL,
	aiVisibilityRetryTool,
	aiVisibilitySearchesTool,
	aiVisibilitySourcesTool,
	aiVisibilityTool,
	anakinClient,
	askUserQuestionSchema,
	askUserTool,
	beginTaskTool,
	browserSessionCreate,
	browserSessionDelete,
	browserSessionList,
	browserSessionRename,
	crawlSiteTool,
	makeRetryAgentTool,
	mapSiteTool,
	presentPlanTool,
	requireKey,
	researchTopicTool,
	resolveAnakinKey,
	scrapeBatchTool,
	scrapeUrlTool,
	searchMemoryTool,
	searchWebTool,
	storeMemoryTool,
	type ToolError,
	type ToolResult,
	updateStepStatusTool,
	wireActionTool,
	wireBuildRequestsTool,
	wireBuildRequestTool,
	wireCatalogTool,
	wireDiscoverTool,
	wireDownloadTool,
};

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
