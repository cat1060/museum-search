// Art Institute of Chicago: https://api.artic.edu/docs/
// Search accepts an Elasticsearch query, sent as JSON in the `params` query parameter.
import { TYPES, Notes } from "../filters.js";
import { getJson, CLIENT_NAME } from "../http.js";

const SEARCH = "https://api.artic.edu/api/v1/artworks/search";
const FIELDS = [
  "id", "title", "artist_title", "artist_display", "date_display", "medium_display",
  "artwork_type_title", "place_of_origin", "image_id", "is_public_domain",
];

export default {
  id: "aic",
  name: "Art Institute of Chicago",

  async search(f) {
    const notes = new Notes();
    const must = [];
    const filter = [{ exists: { field: "image_id" } }];

    if (f.q) notes.applied(`Keyword → q="${f.q}" (searches all fields)`);
    if (f.artist) {
      must.push({ match: { artist_title: { query: f.artist, operator: "and" } } });
      notes.applied(`Artist → match on artist_title`);
    }
    if (f.type) {
      must.push({ match_phrase: { artwork_type_title: TYPES[f.type].aic } });
      notes.applied(`Type → artwork_type_title "${TYPES[f.type].aic}"`);
    }
    if (f.dateFrom != null) {
      filter.push({ range: { date_end: { gte: f.dateFrom } } });
      notes.applied(`From year → date_end ≥ ${f.dateFrom}`);
    }
    if (f.dateTo != null) {
      filter.push({ range: { date_start: { lte: f.dateTo } } });
      notes.applied(`To year → date_start ≤ ${f.dateTo}`);
    }
    if (f.place) {
      must.push({ match: { place_of_origin: f.place } });
      notes.applied(`Place → match on place_of_origin`);
    }
    if (f.material) {
      must.push({ match: { medium_display: f.material } });
      notes.applied(`Material → match on medium_display`);
    }
    if (f.onView) {
      filter.push({ term: { is_on_view: true } });
      notes.applied(`On view → is_on_view = true`);
    }
    if (f.openAccess) {
      filter.push({ term: { is_public_domain: true } });
      notes.applied(`Open access → is_public_domain = true`);
    }

    const params = { query: { bool: { must, filter } }, fields: FIELDS, limit: f.pageSize, page: f.page };
    if (f.q) params.q = f.q;
    const url = `${SEARCH}?params=${encodeURIComponent(JSON.stringify(params))}`;

    const data = await getJson(url, { "AIC-User-Agent": CLIENT_NAME });
    const iiif = data.config?.iiif_url ?? "https://www.artic.edu/iiif/2";
    const total = data.pagination?.total ?? 0;

    return {
      total,
      hasMore: f.page * f.pageSize < Math.min(total, 10000),
      upstream: [url],
      notes: notes.list,
      results: (data.data ?? []).map((a) => ({
        source: "aic",
        id: String(a.id),
        title: a.title || "Untitled",
        artist: a.artist_title || (a.artist_display ?? "").split("\n")[0],
        date: a.date_display ?? "",
        medium: a.medium_display ?? "",
        type: a.artwork_type_title ?? "",
        place: a.place_of_origin ?? "",
        image: a.image_id ? `${iiif}/${a.image_id}/full/843,/0/default.jpg` : null,
        imageLarge: a.image_id ? `${iiif}/${a.image_id}/full/1686,/0/default.jpg` : null,
        url: `https://www.artic.edu/artworks/${a.id}`,
        license: a.is_public_domain ? "Public domain" : "Rights may apply",
      })),
    };
  },
};
