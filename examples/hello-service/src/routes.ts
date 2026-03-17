import type { Hono } from "hono";

const SERVICE_NAME = "hello-service";
const SERVICE_VERSION = "1.0.0";

export function registerRoutes(app: Hono): void {
  app.get("/", (c) => {
    return c.json({ name: SERVICE_NAME, version: SERVICE_VERSION });
  });

  app.get("/hello/:name", (c) => {
    const name = c.req.param("name");
    return c.json({ greeting: `Hello, ${name}!` });
  });
}
