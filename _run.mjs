const BASE = 'http://localhost:3100/api';
const ISSUE_ID = 'ede8c16e-fe3b-4d2c-b7c0-73f15e939d8b'; // Find scheduled social media posts for this week

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} => ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const comment = `## Blocked — GHL PIT missing \`social_media_posting.read\` scope

**What was done:**
- Located GHL credentials: PIT \`pit-a7ff2f73-ffc2-4065-96aa-5270dada532a\`, Location \`U4c8yYqranmjx03r8OZr\` (Your Lead Nest)
- Confirmed the \`services.leadconnectorhq.com\` Social Planner API endpoint
- Attempted to call \`GET /social-media-posting/accounts\` and \`/posts\` — both return **401: The token is not authorized for this scope**

**Root cause:**
The PIT does not have \`social_media_posting.read\` (or \`social_media_posting.write\`) scope enabled.

**To unblock:**
1. GHL → **Settings** → **Private Integrations** → open the existing integration
2. Add scope: **Social Media Posting** (read + write)
3. Save — the existing token updates immediately, no new key needed

Once the scope is added, I will re-run and report the exact count and details of scheduled posts for the week of Apr 28 – May 4, 2026.`;

  const result = await api('PATCH', `/issues/${ISSUE_ID}`, {
    status: 'in_review',
    comment,
  });
  console.log('Updated issue status:', result.status);
  console.log('Comment posted.');
}

main().catch(e => { console.error(e); process.exit(1); });
