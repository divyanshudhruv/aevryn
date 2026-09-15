export { toolContextSchema, type ToolContext } from "./context";
export {
	ANAKIN_BASE_URL,
	anakinClient,
	anakinGet,
	anakinPost,
	isValidCountry,
	listCountries,
	mapAnakinError,
	requireKey,
	type ToolError,
	type ToolResult,
} from "./anakin-client";

export { scrapeUrlTool, type InlineDocument } from "./scrape-url";
export { scrapeBatchTool } from "./scrape-batch";
export { searchWebTool } from "./search-web";
export { crawlSiteTool } from "./crawl-site";
export { mapSiteTool } from "./map-site";
export { researchTopicTool } from "./research-topic";
export { wireDiscoverTool, type DiscoveredAction } from "./wire-discover";
export { wireActionTool, type WireRunResult } from "./wire-action";
export { wireBuildRequestTool, type BuildRequestResult } from "./wire-build-request";
export { aiVisibilityTool, type VisibilitySourceResult } from "./ai-visibility";
export { aiVisibilitySourcesTool, type VisibilitySource } from "./ai-visibility-sources";
export { aiVisibilitySearchesTool, type VisibilitySearchSummary } from "./ai-visibility-searches";
export { aiVisibilityRetryTool } from "./ai-visibility-retry";
export { wireCatalogTool, type CatalogEntry, type CatalogAction } from "./wire-catalog";
export { wireBuildRequestsTool } from "./wire-build-requests";
export { wireDownloadTool } from "./wire-download";
export {
	browserSessionCreate,
	browserSessionDelete,
	browserSessionList,
	browserSessionRename,
} from "./browser-sessions";
export { searchMemoryTool, storeMemoryTool } from "./memory";
export { updateStepStatusTool } from "./workflow-progress";
export {
	askUserTool,
	askUserQuestionSchema,
	presentPlanTool,
} from "./client";

import type { ToolSet } from "ai";

import { aiVisibilityTool } from "./ai-visibility";
import { aiVisibilitySearchesTool } from "./ai-visibility-searches";
import { aiVisibilityRetryTool } from "./ai-visibility-retry";
import { aiVisibilitySourcesTool } from "./ai-visibility-sources";
import {
	browserSessionCreate,
	browserSessionDelete,
	browserSessionList,
	browserSessionRename,
} from "./browser-sessions";
import { askUserTool, presentPlanTool } from "./client";
import { crawlSiteTool } from "./crawl-site";
import { mapSiteTool } from "./map-site";
import { researchTopicTool } from "./research-topic";
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

void updateStepStatusTool; // registered conditionally (run mode) by AgentService
void askUserTool; // client tools are included per-mode by AgentService
void presentPlanTool;

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
} satisfies ToolSet;

export type AnakinToolSet = typeof anakinToolSet;
