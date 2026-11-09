export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(tick(env));
  },
};

async function tick(env) {
  const response = await fetch(`${env.SITE}/api/push/tick`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.PUSH_TICK_SECRET}` },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`push tick failed: ${response.status} ${body.slice(0, 200)}`);
  console.log('push tick', body);
}
