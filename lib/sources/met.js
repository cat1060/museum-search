// The Metropolitan Museum of Art: https://metmuseum.github.io/
// Search returns only object IDs, so each object is fetched separately.
// Filters the search can't express are checked on each fetched object instead.
import { TYPES, Notes } from "../filters.js";
import { getJson, getAll } from "../http.js";

const BASE = "https://collectionapi.metmuseum.org/public/collection";

export default {
  id: "met",
  name: "The Metropolitan Museum of Art",

  async search(f) {
    const notes = new Notes();
    const p = new URLSearchParams();
    const checks = [];

    // Met search can look in artist/culture fields or everywhere, but not both at once.
    if (f.artist && !f.q) {
      p.set("q", f.artist);
      p.set("artistOrCulture", "true");
      notes.applied(`Artist → q="${f.artist}" with artistOrCulture=true`);
    } else {
      p.set("q", f.q || "*");
      if (f.q) notes.applied(`Keyword → q="${f.q}"`);
      if (f.artist) {
        const artist = f.artist.toLowerCase();
        checks.push((o) => o.artistDisplayName.toLowerCase().includes(artist));
        notes.approximate(`Artist → checked on each result (Met can't search keyword and artist together)`);
      }
    }
    p.set("hasImages", "true");

    if (f.type) {
      p.set("medium", TYPES[f.type].met);
      notes.applied(`Type → medium="${TYPES[f.type].met}"`);
    }
    // dateBegin is ignored unless dateEnd is also sent, so fill in whichever is missing.
    if (f.dateFrom != null || f.dateTo != null) {
      p.set("dateBegin", String(f.dateFrom ?? -10000));
      p.set("dateEnd", String(f.dateTo ?? new Date().getFullYear()));
      notes.applied(`Dates → dateBegin=${p.get("dateBegin")}, dateEnd=${p.get("dateEnd")}`);
    }
    if (f.place) {
      p.set("geoLocation", f.place);
      notes.applied(`Place → geoLocation`);
    }
    if (f.onView) {
      p.set("isOnView", "true");
      notes.applied(`On view → isOnView=true`);
    }
    if (f.material) {
      const material = f.material.toLowerCase();
      checks.push((o) => o.medium.toLowerCase().includes(material));
      notes.approximate(`Material → checked on each result's medium (no search parameter)`);
    }
    if (f.openAccess) {
      checks.push((o) => o.isPublicDomain);
      notes.approximate(`Open access → checked on each result's isPublicDomain`);
    }
    if (checks.length) notes.approximate(`Results that fail a check are dropped, so a page can have fewer than ${f.pageSize}.`);

    p.set("offset", String((f.page - 1) * f.pageSize));
    p.set("limit", String(f.pageSize));
    const url = `${BASE}/v1.1/search?${p}`;
    const data = await getJson(url);
    const ids = data.objectIDs ?? [];
    const total = data.total ?? 0;

    const objects = await getAll(ids.map((id) => `${BASE}/v1/objects/${id}`));
    const kept = objects.filter((o) => o.primaryImageSmall && checks.every((check) => check(o)));

    return {
      total,
      hasMore: f.page * f.pageSize < Math.min(total, 10000),
      upstream: [url, `${BASE}/v1/objects/{objectID} × ${ids.length}`],
      notes: notes.list,
      results: kept.map((o) => ({
        source: "met",
        id: String(o.objectID),
        title: o.title || "Untitled",
        artist: o.artistDisplayName || o.culture || "",
        date: o.objectDate ?? "",
        medium: o.medium ?? "",
        type: o.classification || o.objectName || "",
        place: [o.city, o.country].filter(Boolean).join(", ") || o.culture || "",
        image: o.primaryImageSmall,
        imageLarge: o.primaryImage || o.primaryImageSmall,
        url: o.objectURL,
        license: o.isPublicDomain ? "Public domain" : "Rights may apply",
      })),
    };
  },
};
