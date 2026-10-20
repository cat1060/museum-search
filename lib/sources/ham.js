// Harvard Art Museums: https://github.com/harvardartmuseums/api-docs
// Needs a free API key, passed as the apikey query parameter. The key is read from the
// HARVARD_API_KEY environment variable so it never appears in the repo or the browser.
// Terms: non-commercial use only; credit and link back to harvardartmuseums.org.
import { TYPES, Notes } from "../filters.js";
import { getJson } from "../http.js";

const SEARCH = "https://api.harvardartmuseums.org/object";
const FIELDS = "objectid,title,people,dated,classification,medium,culture,images,primaryimageurl,url,imagepermissionlevel";

// Quote a value for an Elasticsearch query string, e.g. medium:("oil on canvas").
const phrase = (s) => `"${s.replace(/["\\]/g, "")}"`;

export default {
  id: "ham",
  name: "Harvard Art Museums",

  async search(f) {
    const key = process.env.HARVARD_API_KEY;
    if (!key) {
      const err = new Error("Harvard needs an API key. Set HARVARD_API_KEY in the Vercel project's environment variables.");
      err.setup = true;
      throw err;
    }

    const notes = new Notes();
    const p = new URLSearchParams({
      hasimage: "1",
      size: String(f.pageSize),
      page: String(f.page),
      fields: FIELDS,
    });
    const q = []; // field queries combined with AND

    if (f.q) {
      p.set("keyword", f.q);
      notes.applied(`Keyword → keyword (titles, artists, description, medium and more)`);
    }
    if (f.artist) {
      q.push(`people.name:(${phrase(f.artist)})`);
      notes.applied(`Artist → q=people.name`);
    }
    if (f.type) {
      const t = typeof TYPES[f.type].ham === "string" ? { classification: TYPES[f.type].ham } : TYPES[f.type].ham;
      let sent;
      if (t.classification) {
        p.set("classification", t.classification);
        sent = `classification "${t.classification}"`;
      } else {
        q.push(`medium:(${phrase(t.medium)})`);
        sent = `q=medium:${t.medium} (no matching classification)`;
      }
      if (t.approximate) notes.approximate(`Type → ${sent}`);
      else notes.applied(`Type → ${sent}`);
    }
    if (f.dateFrom != null) {
      q.push(`dateend:>=${f.dateFrom}`);
      notes.applied(`From year → q=dateend ≥ ${f.dateFrom}`);
    }
    if (f.dateTo != null) {
      q.push(`datebegin:<=${f.dateTo}`);
      notes.applied(`To year → q=datebegin ≤ ${f.dateTo}`);
    }
    if (f.place) {
      q.push(`(culture:(${phrase(f.place)}) OR places.displayname:(${phrase(f.place)}))`);
      notes.applied(`Place → q=culture or places`);
    }
    if (f.material) {
      q.push(`medium:(${phrase(f.material)})`);
      notes.applied(`Material → q=medium`);
    }
    if (f.onView) {
      p.set("gallery", "any");
      notes.applied(`On view → gallery=any`);
    }
    if (f.openAccess) {
      q.push(`imagepermissionlevel:0`);
      notes.approximate(`Open access → imagepermissionlevel:0 (image may be displayed; Harvard has no public-domain flag)`);
    }
    if (q.length) p.set("q", q.join(" AND "));

    const data = await getJson(`${SEARCH}?apikey=${encodeURIComponent(key)}&${p}`);
    const total = data.info?.totalrecords ?? 0;

    return {
      total,
      hasMore: f.page < (data.info?.pages ?? 0),
      // Show the request without the key.
      upstream: [`${SEARCH}?apikey=•••&${p}`],
      notes: notes.list,
      results: (data.records ?? []).map((o) => {
        // baseimageurl (e.g. https://nrs.harvard.edu/urn-3:HUAM:92037_dynmc) resolves to the
        // image and accepts ?width=. Don't build URLs from imageid: on Harvard Library's image
        // server that number belongs to an unrelated image.
        const base = o.images?.[0]?.baseimageurl ?? o.primaryimageurl;
        return {
          source: "ham",
          id: String(o.objectid),
          title: o.title || "Untitled",
          artist: (o.people ?? []).filter((x) => x.role === "Artist").map((x) => x.name).join(", ") || o.people?.[0]?.name || o.culture || "",
          date: o.dated ?? "",
          medium: o.medium ?? "",
          type: o.classification ?? "",
          place: o.culture ?? "",
          image: base ? `${base}?width=600` : null,
          imageLarge: base ? `${base}?width=1600` : null,
          url: o.url ?? `https://harvardartmuseums.org/collections/object/${o.objectid}`,
          license: o.imagepermissionlevel === 0 ? "Display permitted (non-commercial)" : "Rights may apply",
        };
      }),
    };
  },
};
