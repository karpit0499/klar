import type { MetadataRoute } from "next";
import { allDocs } from "../lib/docs";
import { SITE_URL } from "../lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const releaseDate = new Date("2026-08-11T00:00:00Z");
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: releaseDate,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/docs`,
      lastModified: releaseDate,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  return [
    ...staticPages,
    ...allDocs().map((doc) => ({
      url: `${SITE_URL}/docs/${doc.slug}`,
      lastModified: new Date(`${doc.lastVerified}T00:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
