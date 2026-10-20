// GET /api/search?source=aic|cma|met|rijks|ham&q=...&artist=...&type=...&page=...
// Searches one museum and returns results in a shared format.
import { parseFilters } from "../lib/filters.js";
import aic from "../lib/sources/aic.js";
import cma from "../lib/sources/cma.js";
import met from "../lib/sources/met.js";
import rijks from "../lib/sources/rijks.js";
import ham from "../lib/sources/ham.js";

const SOURCES = { aic, cma, met, rijks, ham };

export default async function handler(req, res) {
  const source = SOURCES[req.query.source];
  if (!source) {
    return res.status(400).json({ error: "Unknown source. Use aic, cma, met, rijks or ham." });
  }

  const filters = parseFilters(req.query);
  try {
    const result = await source.search(filters);
    res.status(200).json({ source: source.id, name: source.name, page: filters.page, ...result });
  } catch (err) {
    const error = err.setup ? err.message : `Couldn't reach ${source.name}: ${err.message}`;
    res.status(502).json({ source: source.id, name: source.name, error });
  }
}
