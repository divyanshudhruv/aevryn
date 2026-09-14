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
export {
	browserSessionCreate,
	browserSessionDelete,
	browserSessionList,
	browserSessionRename,
} from "./browser-sessions";
export { searchMemoryTool, storeMemoryTool } from "./memory";
export { updateStepStatusTool } from "./workflow-progress";

import type { ToolSet } from "ai";

import { aiVisibilityTool } from "./ai-visibility";
import {
	browserSessionCreate,
	browserSessionDelete,
	browserSessionList,
	browserSessionRename,
} from "./browser-sessions";
import { crawlSiteTool } from "./crawl-site";
import { mapSiteTool } from "./map-site";
import { researchTopicTool } from "./research-topic";
import { scrapeBatchTool } from "./scrape-batch";
import { scrapeUrlTool } from "./scrape-url";
import { searchWebTool } from "./search-web";
import { wireActionTool } from "./wire-action";
import { wireBuildRequestTool } from "./wire-build-request";
import { wireDiscoverTool } from "./wire-discover";
import { updateStepStatusTool } from "./workflow-progress";

void updateStepStatusTool; // registered conditionally (run mode) by AgentService

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
	browserSessionList,
	browserSessionCreate,
	browserSessionRename,
	browserSessionDelete,
} satisfies ToolSet;

export type AnakinToolSet = typeof anakinToolSet;
