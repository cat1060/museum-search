// Cleveland Museum of Art: https://openaccess-api.clevelandart.org/
// Every filter is a plain query parameter. Flags such as cc0 take no value.
import { TYPES, Notes } from "../filters.js";
import { getJson } from "../http.js";

const SEARCH = "https://openaccess-api.clevelandart.org/api/artworks/";
const FIELDS = "id,title,creators,creation_date,technique,type,culture,images,url,share_license_status";

export default {
  id: "cma",
  name: "Cleveland Museum of Art",

  async search(f) {
    const notes = new Notes();
    const p = new URLSearchParams({
      has_image: "1",
      skip: String((f.page - 1) * f.pageSize),
      limit: String(f.pageSize),
      fields: FIELDS,
    });

    if (f.q) {
      p.set("q", f.q);
      notes.applied(`Keyword → q (title, creator, description and more)`);
    }
    if (f.artist) {
      p.set("artists", f.artist);
      notes.applied(`Artist → artists`);
    }
    if (f.type) {
      p.set("type", TYPES[f.type].cma);
      notes.applied(`Type → type "${TYPES[f.type].cma}"`);
    }
    if (f.dateFrom != null) {
      p.set("created_after", String(f.dateFrom));
      notes.applied(`From year → created_after=${f.dateFrom}`);
    }
    if (f.dateTo != null) {
      p.set("created_before", String(f.dateTo));
      notes.applied(`To year → created_before=${f.dateTo}`);
    }
    if (f.place) {
      p.set("culture", f.place);
      notes.approximate(`Place → culture (the creator's culture, e.g. "France, 19th century")`);
    }
    if (f.material) {
      p.set("technique", f.material);
      notes.applied(`Material → technique`);
    }
    if (f.onView) {
      p.set("currently_on_view", "");
      notes.applied(`On view → currently_on_view`);
    }
    if (f.openAccess) {
      p.set("cc0", "");
      notes.applied(`Open access → cc0`);
    }

    const url = `${SEARCH}?${p}`;
    const data = await getJson(url);
    const total = data.info?.total ?? 0;

    return {
      total,
      // The API returns at most the first 1,000 matches.
      hasMore: f.page * f.pageSize < Math.min(total, 1000),
      upstream: [url],
      notes: notes.list,
      results: (data.data ?? []).map((a) => ({
        source: "cma",
        id: String(a.id),
        title: a.title || "Untitled",
        artist: a.creators?.[0]?.description ?? "",
        date: a.creation_date ?? "",
        medium: a.technique ?? "",
        type: a.type ?? "",
        place: a.culture?.[0] ?? "",
        image: a.images?.web?.url ?? null,
        imageLarge: a.images?.web?.url ?? null,
        url: a.url,
        license: a.share_license_status === "CC0" ? "CC0" : "Rights may apply",
      })),
    };
  },
};
