import { serve } from "@hono/node-server";
import app from "./app";

serve({ fetch: app.fetch, port: 3111 }, () => {
  console.log("hello-service listening on http://localhost:3111");
});
