import { Hono } from "hono";
import type { AppContext } from "../env";
import { currentUser } from "../lib/currentUser";

export const logos = new Hono<AppContext>();

export const logoKey = (logoId: string) => `logos/${logoId}`;

// Which brands have a logo: { "walkers": "<logoId>", ... }. The app loads this
// once and uses it wherever a snack has no photo.
logos.get("/", async (c) => {
  currentUser(c);
  const { results } = await c.env.DB.prepare("SELECT brand_key, logo_id FROM brand_logos").all<{
    brand_key: string;
    logo_id: string;
  }>();
  return c.json({ logos: Object.fromEntries(results.map((r) => [r.brand_key, r.logo_id])) });
});

// Serve a logo. A new upload gets a new id, so one id never changes.
logos.get("/:id", async (c) => {
  currentUser(c);
  const object = await c.env.PHOTOS.get(logoKey(c.req.param("id")));
  if (!object) return c.json({ error: "Logo not found." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/png",
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: object.httpEtag,
    },
  });
});
