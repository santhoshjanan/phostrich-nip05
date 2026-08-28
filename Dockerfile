FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# SvelteKit evaluates src/lib/server/config.ts (which validates process.env at
# module load) while building. These are throwaway non-secret placeholders that
# satisfy that validation for the build only — they are not ARG/build-args and
# are never persisted as ENV, so no secret or real value is baked into the image.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
    VALKEY_URL=redis://localhost:6379 \
    PUBLIC_ORIGIN=http://localhost:3000 \
    pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3000
CMD ["node", "build/index.js"]
