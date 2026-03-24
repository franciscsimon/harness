import type { Context } from "hono";
import * as v from "valibot";

/**
 * Parse and validate a JSON request body against a Valibot schema.
 * Returns `{ data }` on success or `{ error, response }` on failure.
 */
export async function validateBody<T extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  c: Context,
  schema: T,
): Promise<{ data: v.InferOutput<T>; error?: never } | { data?: never; error: string; response: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { error: "Invalid JSON body", response: c.json({ error: "Invalid JSON body" }, 400) };
  }
  const result = v.safeParse(schema, raw);
  if (!result.success) {
    const issues = result.issues.map((i) => i.message).join("; ");
    return { error: issues, response: c.json({ error: issues }, 400) };
  }
  return { data: result.output };
}
