# Core Storage

`storage.js` is a small async JSON store with:
- per-file write queue
- debounced flush
- atomic writes

Files are stored under `store/core/*.json`.
