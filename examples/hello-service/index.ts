import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { registerRoutes } from "./routes";

const app = new Hono();
registerRoutes(app);

const port = Number(process.env.PORT) || 3111;
serve({ fetch: app.fetch, port }, () => {
  console.log(`  🎯 hello-service → http://localhost:${port}`);
});
