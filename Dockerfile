# Stage 1: install all workspace deps and build the client SPA
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN bun install --frozen-lockfile
COPY packages ./packages
COPY apps/client ./apps/client
RUN bun run --cwd apps/client build

# Stage 2: slim runtime — server runs TS directly, client is prebuilt static files
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
# client deps are all devDependencies, so --production installs nothing for it
RUN bun install --frozen-lockfile --production
COPY packages/protocol ./packages/protocol
COPY apps/server ./apps/server
COPY --from=build /app/apps/client/dist ./apps/client/dist
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "apps/server/src/index.ts"]
