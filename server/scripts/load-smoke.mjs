// ANA Meet load smoke: exercises the real HTTP stack (no test doubles)
// and reports per-endpoint latency + errors. Establishes a baseline;
// it is NOT a capacity claim — see PLAN §56.
//
// Usage:
//   npm run load:smoke
//   BASE_URL=http://localhost:4000 USERS=20 CONCURRENCY=10 npm run load:smoke
//
// The dev auth limiter allows 50 auth hits / 15 min / IP by default, so
// keep USERS modest or raise RATE_LIMIT_AUTH_MAX for bigger runs.

const BASE = process.env.BASE_URL ?? 'http://localhost:4000';
const USERS = Number(process.env.USERS ?? 20);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 10);
const AJAX = { 'X-Requested-With': 'XMLHttpRequest' };

const stats = new Map();

function record(name, ms, ok) {
  let s = stats.get(name);
  if (!s) {
    s = { count: 0, errors: 0, times: [] };
    stats.set(name, s);
  }
  s.count += 1;
  if (!ok) s.errors += 1;
  else s.times.push(ms);
}

async function timed(name, fn) {
  const start = performance.now();
  try {
    const res = await fn();
    record(name, performance.now() - start, res.ok);
    if (!res.ok) console.error(`FAIL ${name}: HTTP ${res.status}`);
    return res;
  } catch (err) {
    record(name, performance.now() - start, false);
    console.error(`FAIL ${name}: ${err.message}`);
    return { ok: false, status: 0, json: async () => ({}) };
  }
}

async function pool(items, size, fn) {
  const results = [];
  const queue = items.map((item, index) => ({ item, index }));
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length > 0) {
      const { item, index } = queue.shift();
      results.push(await fn(item, index));
    }
  });
  await Promise.all(workers);
  return results;
}

function cookiesFrom(res) {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return setCookies.map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  const ready = await timed('GET /ready', () => fetch(`${BASE}/ready`));
  if (!ready.ok) throw new Error('Server not ready — start dependencies first');

  const nonce = Date.now().toString(36);
  const users = await pool(Array.from({ length: USERS }, (_, i) => i), CONCURRENCY, async (i) => {
    const username = `load${nonce}${i}`;
    const res = await timed('POST /auth/register', () =>
      fetch(`${BASE}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...AJAX },
        body: JSON.stringify({
          username,
          email: `${username}@example.com`,
          password: 's3cure-passphrase',
          displayName: `Load ${i}`,
        }),
      }),
    );
    const body = await res.json().catch(() => ({}));
    return { id: body.user?.id, cookie: cookiesFrom(res) };
  });

  const active = users.filter((u) => u.id);
  console.log(`registered ${active.length}/${USERS}`);

  await pool(active, CONCURRENCY, async (u, idx) => {
    const headers = { cookie: u.cookie };
    const peer = active[(idx + 1) % active.length];
    await timed('GET /auth/me', () => fetch(`${BASE}/api/v1/auth/me`, { headers }));
    await timed('GET /users/search', () =>
      fetch(`${BASE}/api/v1/users/search?q=load${nonce}`, { headers }),
    );
    const dmRes = await timed('POST /conversations/direct', () =>
      fetch(`${BASE}/api/v1/conversations/direct`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: u.cookie, ...AJAX },
        body: JSON.stringify({ peerId: peer.id }),
      }),
    );
    const dm = await dmRes.json().catch(() => ({}));
    const convoId = dm.conversation?.id;
    if (convoId) {
      for (let m = 0; m < 3; m += 1) {
        await timed('POST /messages', () =>
          fetch(`${BASE}/api/v1/conversations/${convoId}/messages`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: u.cookie, ...AJAX },
            body: JSON.stringify({
              type: 'TEXT',
              content: `load msg ${m}`,
              clientMessageId: crypto.randomUUID(),
            }),
          }),
        );
      }
      await timed('GET /messages', () =>
        fetch(`${BASE}/api/v1/conversations/${convoId}/messages?limit=20`, { headers }),
      );
    }
    await timed('GET /conversations', () => fetch(`${BASE}/api/v1/conversations`, { headers }));
    await timed('GET /notifications', () => fetch(`${BASE}/api/v1/notifications?limit=20`, { headers }));
  });

  console.log('\nendpoint                      count  errors    avg    p50    p95    max');
  let totalErrors = 0;
  let totalCount = 0;
  for (const [name, s] of stats) {
    const t = [...s.times].sort((a, b) => a - b);
    const q = (p) => (t.length > 0 ? t[Math.min(t.length - 1, Math.floor(p * t.length))].toFixed(0) : '-');
    const avg = t.length > 0 ? (t.reduce((a, b) => a + b, 0) / t.length).toFixed(0) : '-';
    console.log(
      `${name.padEnd(28)} ${String(s.count).padStart(5)} ${String(s.errors).padStart(7)} ${String(avg).padStart(6)} ${String(q(0.5)).padStart(6)} ${String(q(0.95)).padStart(6)} ${String(q(1)).padStart(6)}`,
    );
    totalErrors += s.errors;
    totalCount += s.count;
  }
  console.log(`\n${totalCount - totalErrors}/${totalCount} ok`);
  if (totalErrors / Math.max(totalCount, 1) > 0.05) {
    console.error('SMOKE FAILED: error rate above 5%');
    process.exit(1);
  }
  console.log('SMOKE OK');
}

main().catch((err) => {
  console.error(`SMOKE FAILED: ${err.message}`);
  process.exit(1);
});
