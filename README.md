# Museum Search

Search four open museum collections at once:

- Art Institute of Chicago
- Cleveland Museum of Art
- The Metropolitan Museum of Art
- Rijksmuseum

Choose which collections to search, then narrow by artist, object type, date range, place, material, on-view status and open-access images. Each museum's API supports different filters, so the app shows exactly how your search was sent to each museum: applied as-is (✓), approximated (≈), or not supported (✕).

## How it works

```
index.html, app.js, styles.css   The page. Calls /api/search once per selected museum.
api/search.js                    Vercel serverless function. Picks a museum module and returns results in one shared format.
lib/filters.js                   The shared filter model and the object-type table for each museum.
lib/sources/*.js                 One module per museum that translates the filters into that museum's API.
lib/http.js                      Small fetch helpers (timeouts, limited concurrency, one retry).
```

Every result has the same shape:

```json
{ "source": "met", "id": "436524", "title": "Sunflowers", "artist": "Vincent van Gogh",
  "date": "1887", "medium": "Oil on canvas", "type": "Paintings", "place": "",
  "image": "https://…", "imageLarge": "https://…", "url": "https://…", "license": "Public domain" }
```

## Notes on each API

- **Art Institute of Chicago**: Elasticsearch query in the `params` parameter. Its image server rejects requests that send another site as the referrer, so images use `referrerpolicy="no-referrer"`.
- **Cleveland**: plain query parameters; search returns at most 1,000 results.
- **The Met**: search returns only IDs, so each object is fetched separately (four at a time). Material and open-access are checked on each object.
- **Rijksmuseum**: no keyword search (the keyword searches titles), no date ranges (approximated with a `creationDate` wildcard, then checked), and each result is a Linked Art record that has to be parsed.

## Run locally

```bash
npm i -g vercel
vercel dev
```

Then open http://localhost:3000.

## Data and licences

Data and images come from each museum's open-access API. Check each work's licence, shown in its detail view, before reusing an image.
