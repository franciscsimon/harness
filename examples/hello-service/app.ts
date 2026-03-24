import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ name: "hello-service", version: "1.0.0" });
});

app.get("/hello/:name", (c) => {
  const name = c.req.param("name");
  return c.json({ greeting: `Hello, ${name}!` });
});

export default app;
