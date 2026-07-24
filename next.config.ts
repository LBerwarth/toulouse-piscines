import type { NextConfig } from "next";

// Le service worker est servi par app/sw.js/route.ts, qui fixe lui-même ses
// en-têtes (type + Cache-Control « no-cache »).
const nextConfig: NextConfig = {};

export default nextConfig;
