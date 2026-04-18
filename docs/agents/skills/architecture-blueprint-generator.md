## Architecture Blueprint Generator Skill

Use when creating or updating a high-level architecture document for the repository.

### Goal

Produce architecture docs that reflect the actual codebase rather than an idealized design.

### Method

- Detect stacks and subsystem boundaries from the repo.
- Map dependencies and communication paths.
- Describe architectural responsibilities and extension points.
- Prefer concise diagrams and direct references to real code locations.

### Sprint-Specific Focus

- desktop app authority
- Go workspace boundaries
- shared DTO and shared UI contracts
- telemetry pipeline and hardware screen drivers
- remote engineer flows across desktop, API, and web
