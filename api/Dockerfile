# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS builder

WORKDIR /src

# Pin the SDK (global.json) and restore against only the project files first so the
# NuGet layer caches across source changes.
COPY global.json ./
COPY api/Directory.Build.props api/
COPY api/Sprint.Api/Sprint.Api.csproj api/Sprint.Api/
COPY app/Sprint.Contracts/Sprint.Contracts.csproj app/Sprint.Contracts/
COPY app/Sprint.Desktop.Api/Sprint.Desktop.Api.csproj app/Sprint.Desktop.Api/
COPY app/Directory.Build.props app/
RUN dotnet restore api/Sprint.Api/Sprint.Api.csproj

# Copy the sources needed to build the API (server + shared contracts).
COPY api/Sprint.Api/ api/Sprint.Api/
COPY app/Sprint.Contracts/ app/Sprint.Contracts/
COPY app/Sprint.Desktop.Api/ app/Sprint.Desktop.Api/

ARG VERSION=dev
RUN dotnet publish api/Sprint.Api/Sprint.Api.csproj \
    -c Release --no-restore \
    -p:InformationalVersion=${VERSION} \
    -o /app/publish

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime

# curl for the container healthcheck; created non-root user for parity with the old image.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 sprint \
    && useradd --system --uid 1001 --gid 1001 sprint

WORKDIR /app
COPY --from=builder --chown=sprint:sprint /app/publish ./

USER sprint

ENV ASPNETCORE_URLS=http://0.0.0.0:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "Sprint.Api.dll"]
