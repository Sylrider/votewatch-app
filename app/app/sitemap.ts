import type { MetadataRoute } from 'next';
import { getPoliticianSlugs, getLobbies } from '@/lib/data';

const BASE_URL = 'https://watchgov.org';

// Static export: Next.js compiles this into a static /sitemap.xml at build time.
export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL + '/', lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: BASE_URL + '/methodology', lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: BASE_URL + '/lobbies', lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
  ];

  const politicianSlugs = await getPoliticianSlugs();
  const politicianRoutes: MetadataRoute.Sitemap = politicianSlugs.map((p) => ({
    url: BASE_URL + '/politicians/' + p.slug,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const lobbies = await getLobbies();
  const lobbyRoutes: MetadataRoute.Sitemap = lobbies.map((l) => ({
    url: BASE_URL + '/lobbies/' + l.slug,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...politicianRoutes, ...lobbyRoutes];
}
