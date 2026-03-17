import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/", (c) => c.json({ service: "hello-service", version: "1.0.0" }));

app.get("/hello/:name", (c) => {
  const name = c.req.param("name");
  return c.json({ message: `Hello ${name}!` });
});

const port = Number(process.env.PORT ?? "4000");
serve({ fetch: app.fetch, port }, () => {
  console.log(`  🎯 hello-service running → http://localhost:${port}`);
});
