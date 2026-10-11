import { URL } from "node:url";

const browserApi = process.env.NEXT_PUBLIC_API_URL || "";
const upstream = process.env.API_UPSTREAM_URL || "";

if (browserApi !== "/api") {
  console.error("Deployment check failed: NEXT_PUBLIC_API_URL must be /api so browser requests stay first-party.");
  process.exit(1);
}

let url;
try {
  url = new URL(upstream);
} catch {
  console.error("Deployment check failed: API_UPSTREAM_URL must be an absolute HTTPS FastAPI origin.");
  process.exit(1);
}

if (
  url.protocol !== "https:" ||
  !url.hostname ||
  ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname) ||
  url.username || url.password ||
  (url.pathname !== "/" && url.pathname !== "") ||
  url.search || url.hash
) {
  console.error("Deployment check failed: API_UPSTREAM_URL must be a public HTTPS origin without path, credentials or query.");
  process.exit(1);
}

console.log("Deployment frontend proxy configuration check passed.");
