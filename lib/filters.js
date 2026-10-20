// Shared filter model. The browser sends these query parameters to /api/search,
// and each museum module translates them into that museum's own API.

// Object types, and the value each museum uses for them.
// The Rijksmuseum has no single type for some of these, so a material stands in.
export const TYPES = {
  painting:   { label: "Painting",   aic: "Painting",               cma: "Painting",               met: "Paintings",   rijks: { type: "painting" } },
  sculpture:  { label: "Sculpture",  aic: "Sculpture",              cma: "Sculpture",              met: "Sculpture",   rijks: { type: "sculpture" } },
  print:      { label: "Print",      aic: "Print",                  cma: "Print",                  met: "Prints",      rijks: { type: "print" } },
  drawing:    { label: "Drawing",    aic: "Drawing and Watercolor", cma: "Drawing",                met: "Drawings",    rijks: { type: "drawing" } },
  photograph: { label: "Photograph", aic: "Photograph",             cma: "Photograph",             met: "Photographs", rijks: { type: "photograph" } },
  textile:    { label: "Textile",    aic: "Textile",                cma: "Textile",                met: "Textiles",    rijks: { type: "textile" } },
  ceramics:   { label: "Ceramics",   aic: "Ceramics",               cma: "Ceramic",                met: "Ceramics",    rijks: { material: "earthenware", approximate: true } },
  furniture:  { label: "Furniture",  aic: "Furniture",              cma: "Furniture and woodwork", met: "Furniture",   rijks: { type: "furniture" } },
  metalwork:  { label: "Metalwork",  aic: "Metalwork",              cma: "Metalwork",              met: "Metalwork",   rijks: { material: "silver", approximate: true } },
  glass:      { label: "Glass",      aic: "Glass",                  cma: "Glass",                  met: "Glass",       rijks: { material: "glass" } },
};

export const PAGE_SIZE = 12;

const text = (v) => (Array.isArray(v) ? v[0] : v ?? "").toString().trim().slice(0, 200);
const year = (v) => {
  const n = parseInt(text(v), 10);
  return Number.isFinite(n) ? n : null;
};
const flag = (v, fallback) => {
  const s = text(v);
  return s === "" ? fallback : s === "1" || s === "true";
};

export function parseFilters(query) {
  const type = text(query.type);
  return {
    q: text(query.q),
    artist: text(query.artist),
    type: TYPES[type] ? type : "",
    dateFrom: year(query.dateFrom),
    dateTo: year(query.dateTo),
    place: text(query.place),
    material: text(query.material),
    onView: flag(query.onView, false),
    openAccess: flag(query.openAccess, true),
    page: Math.min(50, Math.max(1, year(query.page) ?? 1)),
    pageSize: PAGE_SIZE,
  };
}

// Each museum reports how it handled every filter, so the app can show the translation.
export class Notes {
  constructor() { this.list = []; }
  applied(text) { this.list.push({ level: "applied", text }); }
  approximate(text) { this.list.push({ level: "approximate", text }); }
  ignored(text) { this.list.push({ level: "ignored", text }); }
}

// True when an object's years overlap the requested range. Missing years count as a match.
export function inDateRange(f, begin, end) {
  if (f.dateFrom != null && end != null && end < f.dateFrom) return false;
  if (f.dateTo != null && begin != null && begin > f.dateTo) return false;
  return true;
}
