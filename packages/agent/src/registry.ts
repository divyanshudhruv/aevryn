import { AnakinBrowserSessionAdapter } from "./adapters/anakin-browser-session";
import { AnakinCrawlAdapter } from "./adapters/anakin-crawl";
import { AnakinMapAdapter } from "./adapters/anakin-map";
import { AnakinResearchAdapter } from "./adapters/anakin-research";
import { AnakinScrapeAdapter } from "./adapters/anakin-scrape";
import { AnakinSearchAdapter } from "./adapters/anakin-search";
import { AnakinWireAdapter } from "./adapters/anakin-wire";
import { createBrowserSessionCreateCapability } from "./capabilities/browser-session-create";
import { createBrowserSessionDeleteCapability } from "./capabilities/browser-session-delete";
import { createBrowserSessionListCapability } from "./capabilities/browser-session-list";
import { createBrowserSessionRenameCapability } from "./capabilities/browser-session-rename";
import { createCrawlSiteCapability } from "./capabilities/crawl-site";
import { createMapSiteCapability } from "./capabilities/map-site";
import { createResearchTopicCapability } from "./capabilities/research-topic";
import { createScrapeUrlCapability } from "./capabilities/scrape-url";
import { createSearchWebCapability } from "./capabilities/search-web";
import { createWireActionCapability } from "./capabilities/wire-action";
import { CapabilityRegistry } from "./capability";

export function createDefaultRegistry(): CapabilityRegistry {
	const registry = new CapabilityRegistry();
	const search = new AnakinSearchAdapter();
	const scrape = new AnakinScrapeAdapter();
	const crawl = new AnakinCrawlAdapter();
	const map = new AnakinMapAdapter();
	const research = new AnakinResearchAdapter();
	const wire = new AnakinWireAdapter();
	const sessions = new AnakinBrowserSessionAdapter();

	registry.register(createSearchWebCapability(search));
	registry.register(createScrapeUrlCapability(scrape));
	registry.register(createCrawlSiteCapability(crawl));
	registry.register(createMapSiteCapability(map));
	registry.register(createResearchTopicCapability(research));
	registry.register(createWireActionCapability(wire));
	registry.register(createBrowserSessionListCapability(sessions));
	registry.register(createBrowserSessionCreateCapability(sessions));
	registry.register(createBrowserSessionRenameCapability(sessions));
	registry.register(createBrowserSessionDeleteCapability(sessions));
	return registry;
}
