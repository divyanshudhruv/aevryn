import { describe, expect, it } from "vitest";

import { checkExternalUrl } from "../src/ssrf-guard";

function blocked(raw: string, reasonMatch?: RegExp) {
	const v = checkExternalUrl(raw);
	expect(v.blocked, `expected blocked: ${raw}`).toBe(true);
	if (reasonMatch) expect(v.reason).toMatch(reasonMatch);
	return v;
}

function allowed(raw: string) {
	const v = checkExternalUrl(raw);
	expect(v.blocked, `expected allowed: ${raw}`).toBe(false);
	return v;
}

describe("checkExternalUrl", () => {
	it("allows public http(s) URLs", () => {
		allowed("https://example.com/path?q=1");
		allowed("http://sub.example.org:8080/x");
		allowed("https://example.com");
	});

	it("rejects malformed and non-http URLs", () => {
		blocked("not a url", /Malformed/);
		blocked("", /Malformed/);
		blocked("ftp://example.com/file", /http\(s\)/);
		blocked("file:///etc/passwd", /http\(s\)/);
	});

	it("rejects embedded credentials", () => {
		blocked("https://user:pass@example.com/", /credentials/);
		blocked("https://token@example.com/", /credentials/);
	});

	it("rejects reserved/protected hosts", () => {
		blocked("http://localhost/", /not reachable/);
		blocked("http://LOCALHOST/", /not reachable/);
		blocked("http://metadata.google.internal/", /not reachable/);
		blocked("http://instance-data.ec2.internal/", /not reachable/);
		blocked("http://db.internal/", /not reachable/);
		blocked("http://consul.local/", /not reachable/);
		blocked("http://foo.home.arpa/", /not reachable/);
	});

	it("rejects private IPv4 literals (incl. CIDR edges and 0/8, 127/8)", () => {
		blocked("http://10.0.0.1/", /private/);
		blocked("http://10.255.255.255/", /private/);
		blocked("http://192.168.1.1/", /private/);
		blocked("http://172.16.0.1/", /private/);
		blocked("http://172.31.255.254/", /private/);
		blocked("http://127.0.0.1/", /private/);
		blocked("http://0.0.0.0/", /private/);
		blocked("http://169.254.169.254/", /private/);
		blocked("http://100.64.0.1/", /private/);
		blocked("http://198.18.0.1/", /private/);
		blocked("http://240.0.0.1/", /private/);
		blocked("http://203.0.113.9/", /private/);
	});

	it("allows public IPv4 literals", () => {
		allowed("http://8.8.8.8/");
		allowed("http://1.1.1.1/");
		allowed("http://93.184.216.34/");
	});

	it("rejects private/loopback IPv6 literals and v4-mapped", () => {
		blocked("http://[::1]/", /private/);
		blocked("http://[fe80::1]/", /private/);
		blocked("http://[fd00::1]/", /private/);
		blocked("http://[fc00::1]/", /private/);
		blocked("http://[2001:db8::1]/", /private/);
		blocked("http://[::ffff:127.0.0.1]/", /private/);
		blocked("http://[::ffff:10.0.0.1]/", /private/);
	});

	it("allows public IPv6 literals", () => {
		allowed("http://[2606:4700:4700::1111]/");
	});
});