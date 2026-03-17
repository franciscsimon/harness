import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { registerRoutes } from "./routes.js";

const app = new Hono();

registerRoutes(app);

serve({ fetch: app.fetch, port: 3111 }, () => {
  console.log("hello-service listening on http://localhost:3111");
});
