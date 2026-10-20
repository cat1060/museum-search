// Rijksmuseum: https://data.rijksmuseum.nl/docs/search
// Search returns pages of 100 object IDs. Each object is a Linked Art record that
// has to be fetched and picked apart for its title, maker, date and image.
import { TYPES, Notes, inDateRange } from "../filters.js";
import { getJson, getAll } from "../http.js";

const SEARCH = "https://data.rijksmuseum.nl/search/collection";
const ENGLISH = "http://vocab.getty.edu/aat/300388277";
const LD = { Accept: "application/ld+json" };

export default {
  id: "rijks",
  name: "Rijksmuseum",

  async search(f) {
    const notes = new Notes();
    const p = new URLSearchParams();
    const checks = [];

    if (f.q) {
      p.set("title", f.q);
      notes.approximate(`Keyword → title (the Rijksmuseum has no all-fields keyword search)`);
    }
    if (f.artist) {
      p.set("creator", f.artist);
      notes.applied(`Artist → creator`);
    }
    if (f.type) {
      const t = TYPES[f.type].rijks;
      if (t.type) p.append("type", t.type);
      if (t.material) p.append("material", t.material);
      const sent = t.type ? `type=${t.type}` : `material=${t.material}`;
      if (t.approximate) notes.approximate(`Type → ${sent} (no matching type)`);
      else notes.applied(`Type → ${sent}`);
    }
    if (f.material) {
      p.append("material", f.material);
      notes.applied(`Material → material`);
    }
    if (f.dateFrom != null || f.dateTo != null) {
      const pattern = yearPattern(f.dateFrom, f.dateTo);
      if (pattern) p.set("creationDate", pattern);
      checks.push((o) => inDateRange(f, o.begin, o.end));
      notes.approximate(
        pattern
          ? `Dates → creationDate=${pattern}, then checked on each result`
          : `Dates → checked on each result (no date-range search)`
      );
    }
    if (f.place) notes.ignored(`Place → not supported by the search API`);
    if (f.onView) notes.ignored(`On view → not supported by the search API`);
    if (f.openAccess) {
      checks.push((o) => o.openAccess);
      notes.approximate(`Open access → checked on each result's image licence`);
    }
    p.set("imageAvailable", "true");
    if (checks.length) notes.approximate(`Results that fail a check are dropped, so a page can have fewer than ${f.pageSize}.`);

    // Our pages hold 12 items; the API's hold 100. Walk to the API page that contains ours.
    const start = (f.page - 1) * f.pageSize;
    const url = `${SEARCH}?${p}`;
    let page = await getJson(url, LD);
    for (let i = 0; i < Math.floor(start / 100) && page.next; i++) {
      page = await getJson(page.next.id, LD);
    }
    const ids = (page.orderedItems ?? []).slice(start % 100, start % 100 + f.pageSize).map((x) => x.id);
    const total = page.partOf?.totalItems ?? 0;

    const records = await getAll(ids.map((id) => `${id}?_profile=la-framed`), LD);
    const kept = records.map(parseRecord).filter((o) => o.image && checks.every((check) => check(o)));

    return {
      total,
      hasMore: start + f.pageSize < total,
      upstream: [url, `https://id.rijksmuseum.nl/{id}?_profile=la-framed × ${ids.length}`],
      notes: notes.list,
      results: kept.map(({ begin, end, openAccess, ...rest }) => rest),
    };
  },
};

// The narrowest creationDate wildcard covering a year range, e.g. 1880–1889 → "188?".
function yearPattern(from, to) {
  if (from == null || to == null || from < 1000 || to > 9999 || from > to) return null;
  const a = String(from), b = String(to);
  let same = 0;
  while (same < 4 && a[same] === b[same]) same++;
  return same === 0 ? null : a.slice(0, same) + "?".repeat(4 - same);
}

// Linked Art fields can hold one value or a list of values.
const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isEnglish = (x) => list(x.language).some((l) => l.id === ENGLISH);
const label = (x) => {
  const n = list(x.notation);
  return (n.find((v) => v["@language"] === "en") ?? n[0])?.["@value"] ?? "";
};
const yearOf = (iso) => (iso ? parseInt(iso, 10) : null);

function parseRecord(o) {
  const names = list(o.identified_by).filter((x) => x.type === "Name");
  const prod = list(o.produced_by)[0] ?? {};
  const parts = prod.part ? list(prod.part) : [prod];
  const makers = [...new Set(parts.flatMap((p) => list(p.carried_out_by)).map(label).filter(Boolean))];
  const span = list(prod.timespan ?? parts.find((p) => p.timespan)?.timespan)[0] ?? {};
  const spanNames = list(span.identified_by);

  let image = null, license = "", url = "";
  for (const subject of list(o.subject_of)) {
    for (const digital of list(subject.digitally_carried_by)) {
      for (const point of list(digital.access_point)) {
        if (!point.id) continue;
        if (!image && point.id.includes("iiif.micr.io")) {
          image = point.id;
          const rights = list(digital.referred_to_by)[0] ?? {};
          license = rights._label || rights.content || "";
        } else if (!url && point.id.includes("rijksmuseum.nl")) {
          url = point.id.replace("/nl/collectie/", "/en/collection/");
        }
      }
    }
  }

  return {
    source: "rijks",
    id: o.id.split("/").pop(),
    title: (names.find(isEnglish) ?? names[0])?.content || "Untitled",
    artist: makers.join(", ") || list(prod.referred_to_by).find(isEnglish)?.content || "",
    date: (spanNames.find(isEnglish) ?? spanNames[0])?.content ?? "",
    medium: list(o.made_of).map(label).filter(Boolean).join(", "),
    type: list(o.classified_as).map(label).find(Boolean) ?? "",
    place: "",
    image: image && image.replace("/full/max/", "/full/600,/"),
    imageLarge: image && image.replace("/full/max/", "/full/1600,/"),
    url: url || o.id,
    license: license || "See museum website",
    begin: yearOf(span.begin_of_the_begin),
    end: yearOf(span.end_of_the_end),
    openAccess: /public ?domain|publicdomain|cc0/i.test(license),
  };
}
