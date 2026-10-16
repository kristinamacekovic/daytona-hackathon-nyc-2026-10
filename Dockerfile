# Production image for Railway (or any host that runs one long-lived container).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx next build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
# uv/uvx runs yt-dlp for the link-import fallback (it fetches its own Python on first use).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app ./
# Jobs, previews, brands and the cached demo live here: mount a volume at /app/.data.
RUN mkdir -p /app/.data
EXPOSE 3000
CMD ["sh", "-c", "npx next start -p ${PORT:-3000}"]
