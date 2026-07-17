const baseUrl = process.env.VERIFY_BASE_URL ?? "http://app:3000";

const required = [
  "LOCAL_FAMILY_EMAIL",
  "LOCAL_FAMILY_PASSWORD",
  "LOCAL_NURSE_EMAIL",
  "LOCAL_NURSE_PASSWORD",
  "GATEWAY_API_TOKEN",
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

async function request(path, init = {}) {
  return fetch(`${baseUrl}${path}`, { redirect: "manual", ...init });
}

function sessionCookie(response) {
  const values = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  const cookies = values
    .flatMap((value) => value.split(/,(?=\s*[^;,]+=)/))
    .map((value) => value.split(";", 1)[0])
    .filter((value) => value.startsWith("tka-local-session=") || value.startsWith("tka-role="));

  if (cookies.length !== 2) throw new Error("Login did not issue both local session cookies");
  return cookies.join("; ");
}

async function login(role, email, password, allowedPath, deniedPath) {
  const response = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role, email, password }),
  });
  if (response.status !== 200) throw new Error(`Login failed with HTTP ${response.status}`);

  const cookie = sessionCookie(response);
  const allowed = await request(allowedPath, { headers: { cookie } });
  const denied = await request(deniedPath, { headers: { cookie } });
  if (allowed.status !== 200 || ![307, 308].includes(denied.status)) {
    throw new Error(`Role isolation failed: allowed=${allowed.status}, denied=${denied.status}`);
  }
  return cookie;
}

const health = await request("/api/health/ready");
const healthBody = await health.json();
if (health.status !== 200 || healthBody.status !== "ready" || healthBody.authMode !== "local") {
  throw new Error(`Health check failed: HTTP ${health.status}`);
}

const anonymousDashboard = await request("/api/dashboard");
if (anonymousDashboard.status !== 401) throw new Error("Anonymous dashboard access was not rejected");

const familyCookie = await login(
  "family",
  process.env.LOCAL_FAMILY_EMAIL,
  process.env.LOCAL_FAMILY_PASSWORD,
  "/family",
  "/nurse",
);
await login("nurse", process.env.LOCAL_NURSE_EMAIL, process.env.LOCAL_NURSE_PASSWORD, "/nurse", "/family");

const dashboard = await request("/api/dashboard", { headers: { cookie: familyCookie } });
const dashboardBody = await dashboard.json();
if (dashboard.status !== 200 || dashboardBody.patients?.[0]?.id !== "prod-patient-1") {
  throw new Error("Authenticated dashboard or production seed patient verification failed");
}

const invalidGateway = await request("/api/sensor-samples?patientId=prod-patient-1&limit=1", {
  headers: { authorization: "Bearer invalid" },
});
const validGateway = await request("/api/sensor-samples?patientId=prod-patient-1&limit=1", {
  headers: { authorization: `Bearer ${process.env.GATEWAY_API_TOKEN}` },
});
if (invalidGateway.status !== 401 || validGateway.status !== 200) {
  throw new Error(`Gateway authorization failed: invalid=${invalidGateway.status}, valid=${validGateway.status}`);
}

console.log("Production verification passed: health, local roles, protected data, and gateway authorization.");
