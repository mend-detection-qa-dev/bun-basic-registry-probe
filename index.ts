// Probe stub — not meant to be executed.
// Exists solely to satisfy the project-creator output spec and
// give Mend's scanner a TypeScript entry-point to anchor detection.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const app = new Hono();

const schema = z.object({
  name: z.string(),
});

app.post("/", zValidator("json", schema), (c) => {
  const { name } = c.req.valid("json");
  return c.json({ hello: name });
});

export default app;