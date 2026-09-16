export interface SsrfVerdict {
	blocked: boolean;
	reason?: string;
}

function isIpv4Literal(hostname: string): number[] | null {
	const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
	if (!m) return null;
	const octets = m.slice(1).map(Number);
	if (octets.some((o) => o > 255)) return null;
	return octets;
}

function isIpv6Literal(hostname: string): boolean {
	if (!hostname.includes(":")) return false;
	// IPv6 literals may carry a zone id (`fe80::1%eth0`); strip it.
	const stripped = hostname.split("%")[0]!;
	return stripped.split("::").length <= 2 && /^[0-9a-f:.]+$/i.test(stripped);
}

function inCidr(ip: number[], cidr: string): boolean {
	const [net, prefix] = cidr.split("/") as [string, string];
	const netOctets = net.split(".").map(Number);
	const bits = Number(prefix);
	if (netOctets.length !== 4 || ip.length !== 4) return false;
	for (let i = 0; i < 4; i++) {
		const remaining = bits - i * 8;
		if (remaining <= 0) return true;
		const mask = remaining >= 8 ? 255 : (0xff << (8 - remaining)) & 0xff;
		if ((ip[i]! & mask) !== (netOctets[i]! & mask)) return false;
	}
	return true;
}

const IPV4_PRIVATE_CIDRS = [
	"0.0.0.0/8",
	"10.0.0.0/8",
	"100.64.0.0/10",
	"127.0.0.0/8",
	"169.254.0.0/16",
	"172.16.0.0/12",
	"192.0.0.0/24",
	"192.0.2.0/24",
	"192.168.0.0/16",
	"198.18.0.0/15",
	"198.51.100.0/24",
	"203.0.113.0/24",
	"224.0.0.0/4",
	"240.0.0.0/4",
] as const;

function ipv4IsPrivate(octets: number[]): boolean {
	return IPV4_PRIVATE_CIDRS.some((cidr) => inCidr(octets, cidr));
}

/** Well-known non-routable IPv6 prefixes (link-local, ULA, loopback, multicast,
 *  documentation, NAT64, v4-mapped, unspecified). */
const IPV6_PRIVATE_PREFIXES = [
	"::",
	"::1",
	"2001:db8:",
	"64:ff9b:",
	"fc00:",
	"fd00:",
	"fd",
	"feff",
	"fe80:",
	"fe81:",
	"ff00:",
	"ff",
] as const;

function ipv6IsPrivate(hostname: string): boolean {
	const stripped = hostname.split("%")[0]!.toLowerCase();
	for (const p of IPV6_PRIVATE_PREFIXES) {
		if (stripped.startsWith(p)) return true;
	}
	// v4-mapped (`::ffff:127.0.0.1`) — classify by the embedded address.
	const v4 = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(stripped);
	if (v4) {
		const octets = v4[1]!.split(".").map(Number);
		return ipv4IsPrivate(octets);
	}
	return false;
}

const RESERVED_HOSTS = new Set([
	"localhost",
	"metadata",
	"metadata.google.internal",
	"metadata.google.internal.", // trailing-dot form equals FQDN for resolvers
	"instance-data",
	"instance-data.ec2.internal",
	"api.sys.internal",
]);

function hasReservedSuffix(hostname: string): boolean {
	return (
		hostname.endsWith(".local") ||
		hostname.endsWith(".localhost") ||
		hostname.endsWith(".internal") ||
		hostname.endsWith(".home.arpa")
	);
}

/**
 * Rejects URLs that would target local/private/cloud-metadata endpoints
 * when fetched by a server-side process (SSRF guard). Enforcing http(s)
 * plus IP-literal range checks is deterministic and safe in edge runtimes.
 * Returns `{ blocked: false }` for public URLs.
 */
export function checkExternalUrl(raw: string): SsrfVerdict {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return { blocked: true, reason: "Malformed URL." };
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return { blocked: true, reason: "Only http(s) URLs are allowed." };
	}

	const userinfo = url.username || url.password;
	if (userinfo) {
		return { blocked: true, reason: "Embedded credentials in the URL are not allowed." };
	}

	const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

	if (RESERVED_HOSTS.has(hostname) || hasReservedSuffix(hostname)) {
		return { blocked: true, reason: `Host '${hostname}' is not reachable from the server.` };
	}

	const v4 = isIpv4Literal(hostname);
	if (v4 && ipv4IsPrivate(v4)) {
		return { blocked: true, reason: `IP '${hostname}' is a private/reserved address.` };
	}

	if (!v4 && isIpv6Literal(hostname) && ipv6IsPrivate(hostname)) {
		return { blocked: true, reason: `IP '${hostname}' is a private/reserved address.` };
	}

	return { blocked: false };
}