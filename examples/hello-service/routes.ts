import type { Hono } from "hono";

export function registerRoutes(app: Hono) {
  app.get("/", (c) =>
    c.json({ name: "hello-service", version: "1.0.0" })
  );

  app.get("/hello/:name", (c) =>
    c.json({ greeting: `Hello, ${c.req.param("name")}!` })
  );
}
