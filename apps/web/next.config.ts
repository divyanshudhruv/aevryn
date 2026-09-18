import "@aevryn/env/web";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typedRoutes: true,
	reactCompiler: true,
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "**.googleusercontent.com",
			},
		],
	},
};

export default nextConfig;
