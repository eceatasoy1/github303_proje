# Qever AI

A smart event and photo analysis system based on Python.

## Folder structure


QEVER-AI/
├── backend/        # FastAPI (Python) – analysis, database, statistics
├── frontend/       # User interface (HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── API.md          # API contract between frontend and backend


## Running the frontend

Open the `frontend/index.html` file in your browser.

- If the backend is running at `http://localhost:8000`, the interface connects to it.
- If the backend is closed, **Demo mode** appears at the top right and the app works with sample data.

You can change the backend address in the `CONFIG` part at the top of the `frontend/app.js` file.

## Screens

- **Dashboard:** Event summary and the latest uploaded photos
- **Upload:** Upload many photos with drag and drop
- **Gallery:** Filter by quality class, sort, and search
- **Statistics:** Charts for quality distribution, hourly uploads, and scores
- **Live notifications:** Instant update with WebSocket when a new photo is uploaded

For API addresses and data formats, see the `API.md` file.
