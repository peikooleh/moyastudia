import { URL } from "node:url";

const raw = process.env.NEXT_PUBLIC_API_URL || "";
let url;
try {
  url = new URL(raw);
} catch {
  console.error("Deployment check failed: NEXT_PUBLIC_API_URL must be an absolute HTTPS API URL.");
  process.exit(1);
}

const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
const allowedPath = normalizedPath === "/" || normalizedPath === "/api";

if (
  url.protocol !== "https:" ||
  !url.hostname ||
  ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname) ||
  url.username || url.password ||
  !allowedPath ||
  url.search || url.hash
) {
  console.error("Deployment check failed: NEXT_PUBLIC_API_URL must be a public HTTPS URL with no credentials/query and with either no path or /api.");
  process.exit(1);
}

console.log("Deployment frontend API URL check passed.");
