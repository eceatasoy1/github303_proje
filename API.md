# Qever AI – API Contract (Frontend ↔ FastAPI)

This file helps the frontend and the backend speak the same language.
The frontend sends requests to these addresses. If the backend answers in these formats, everything works directly.

- Backend address: `http://localhost:8000`
- All API addresses start with `/api`.
- All answers are JSON. Dates use the ISO format (`2026-11-02T21:30:00`).

---

## 1. Health check

`GET /api/health`

```json
{ "status": "ok" }
```

The frontend checks this when it opens. If there is no answer, it automatically switches to **demo mode** (sample data).

---

## 2. Events

### List
`GET /api/events`

```json
[
  { "id": 1, "name": "Sanne & Tom Düğünü", "date": "2026-11-02", "location": "İstanbul", "guest_count": 89 }
]
```

### Create
`POST /api/events` – body (JSON):

```json
{ "name": "Mezuniyet 2026", "date": "2026-06-20", "location": "Ankara", "guest_count": 120 }
```

Answer: the new event (in the same format as above, with `id`).

---

## 3. Photos

### Photo object (same format everywhere)

```json
{
  "id": 42,
  "event_id": 1,
  "filename": "IMG_2041.jpg",
  "url": "/media/1/IMG_2041.jpg",
  "thumbnail_url": "/media/1/thumbs/IMG_2041.jpg",
  "uploaded_at": "2026-11-02T21:30:00",
  "status": "done",
  "quality_class": "good",
  "quality_score": 82.5,
  "sharpness": 0.91,
  "brightness": 0.64,
  "faces": 3,
  "width": 4032,
  "height": 3024
}
```

| Field | Meaning |
|---|---|
| `status` | `"processing"` (analysis is running) or `"done"` |
| `quality_class` | `"good"`, `"medium"` or `"bad"` (output of the ML model) |
| `quality_score` | A score from 0 to 100 |
| `sharpness`, `brightness` | A value from 0 to 1 |
| `faces` | Number of faces found |
| `url`, `thumbnail_url` | Can be a relative address (`/media/...`) or a full address |

### List
`GET /api/events/{event_id}/photos?quality=good&sort=score_desc`

- `quality` (optional): `good` | `medium` | `bad`
- `sort` (optional): `newest` (default) | `score_desc` | `score_asc`

Answer: a list of photo objects.

### Upload
`POST /api/events/{event_id}/photos` – `multipart/form-data`, field name: **`files`** (many files are allowed)

FastAPI example:
```python
@app.post("/api/events/{event_id}/photos")
async def upload(event_id: int, files: list[UploadFile] = File(...)):
    ...
```

Answer:
```json
{ "uploaded": [ /* photo objects */ ], "failed": [ { "filename": "x.heic", "error": "Unsupported format" } ] }
```

### Single photo
`GET /api/photos/{photo_id}` → photo object

### Delete
`DELETE /api/photos/{photo_id}` → `{ "deleted": true }`

---

## 4. Statistics (Pandas / NumPy)

`GET /api/events/{event_id}/stats`

```json
{
  "photo_count": 247,
  "video_count": 18,
  "guest_count": 89,
  "avg_quality": 71.4,
  "quality_distribution": { "good": 140, "medium": 80, "bad": 27 },
  "uploads_by_hour": [ { "hour": "19:00", "count": 34 }, { "hour": "20:00", "count": 61 } ],
  "score_histogram": [ { "range": "0-20", "count": 5 }, { "range": "20-40", "count": 22 } ]
}
```

The `score_histogram` ranges are: `0-20`, `20-40`, `40-60`, `60-80`, `80-100`.

---

## 5. Live notifications (WebSocket – Socket Programming)

`WS /ws/events/{event_id}`

When something happens, the backend sends these messages:

```json
{ "type": "photo_uploaded", "photo": { /* photo object */ } }
{ "type": "analysis_done",  "photo": { /* photo object, status: "done" */ } }
```

Example flow: a photo is uploaded → `photo_uploaded` (status `processing`) → the analysis finishes in the background → `analysis_done`.

---

## 6. Notes for the backend

1. **CORS** must be open (if the frontend runs on a different port):
   ```python
   from fastapi.middleware.cors import CORSMiddleware
   app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
   ```
2. For the uploaded photos:
   ```python
   app.mount("/media", StaticFiles(directory="media"), name="media")
   ```
3. If you also want to serve the frontend from FastAPI (one address, no CORS problems):
   ```python
   app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
   ```
   This line must be added **after** all other routes.
