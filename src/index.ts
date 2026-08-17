import { computeStats, runScheduled, saveData, saveSupply } from './services';
import { PUSH_HOURS, SCHEDULED_PASSWD_HASH, SUPPLY_SNAPSHOT_HOUR } from './config';
import type { Env } from './types';
import { trader_main } from './trader';

async function hashPasswd(passwd: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(passwd)
  );

  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    const hour = new Date().getHours();
    await runScheduled(env, PUSH_HOURS.has(hour));
    if (hour === SUPPLY_SNAPSHOT_HOUR) {
      await saveSupply(env);
    }
  },

  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);

    if (url.pathname === "/api/scheduled" && req.method === "POST") {
      const { passwd } = (await req.json()) as { passwd?: string };
      if (!passwd) {
        return Response.json({ error: "missing passwd" }, { status: 400 });
      }
      if ((await hashPasswd(passwd)) !== SCHEDULED_PASSWD_HASH) {
        return Response.json({ error: "invalid passwd" }, { status: 403 });
      }
      await runScheduled(env, true);
      return Response.json({ success: true });
    }

    if (url.pathname === "/api/update") {
      await saveData(env);
      return Response.json({ success: true });
    }

    if (url.pathname === "/api") {
      const stats = await computeStats(env);
      return Response.json(stats);
    }

    if (url.pathname === "/api/test") {
      const { passwd } = (await req.json()) as { passwd?: string };
      if (!passwd) {
        return Response.json({ error: "missing passwd" }, { status: 400 });
      }
      if ((await hashPasswd(passwd)) !== SCHEDULED_PASSWD_HASH) {
        return Response.json({ error: "invalid passwd" }, { status: 403 });
      }
      await trader_main(env);
      return Response.json({ success: true });
    }

    const assetUrl = new URL(req.url);
    if (assetUrl.pathname === "/") {
      assetUrl.pathname = "/index.html";
    }
    return env.ASSETS.fetch(new Request(assetUrl, req));
  },
};
