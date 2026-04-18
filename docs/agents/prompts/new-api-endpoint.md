## New API Endpoint Prompt

Use this prompt when adding a new endpoint to `api/`.

### Checklist

- Confirm the handler belongs in `api/` and not the desktop app.
- Keep SQL inside `api/internal/store/`.
- Add or update DTOs in `pkg/dto` when contracts are shared.
- Mirror shared DTO changes in `packages/types` when needed.
- Register routes in the server wiring using the established `net/http` patterns.
- Add the smallest relevant tests for handler and store behavior.
- Update docs only if the endpoint is externally meaningful.
