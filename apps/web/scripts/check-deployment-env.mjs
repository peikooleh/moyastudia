import { URL } from "node:url";

const raw = process.env.NEXT_PUBLIC_API_URL || "";
let url;
try {
  url = new URL(raw);
} catch {
  console.error("Deployment check failed: NEXT_PUBLIC_API_URL must be an absolute HTTPS API origin.");
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
  console.error("Deployment check failed: NEXT_PUBLIC_API_URL must be a public HTTPS origin without path, credentials or query.");
  process.exit(1);
}

console.log("Deployment frontend API origin check passed.");
