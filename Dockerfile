# Production Dockerfile for Railway (no package-lock required)
# - Uses npm install (not npm ci)
# - Builds Vite client + bundles server into dist/index.cjs
# - Prunes devDependencies for smaller runtime image

FROM node:20-alpine AS build
WORKDIR /app

# Faster, reproducible-ish installs without requiring a lockfile
COPY package.json .npmrc ./
RUN npm install --no-audit --no-fund

# Copy the rest of the project
COPY . .

# Build client + server
RUN npm run build

# Remove devDependencies (tsx/drizzle-kit are in dependencies on purpose)
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# App runtime files
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
COPY --from=build /app/script /app/script
COPY --from=build /app/shared /app/shared
COPY --from=build /app/drizzle.config.ts /app/drizzle.config.ts

# If you later add local migrations folder, copy it too (optional)
# COPY --from=build /app/migrations /app/migrations

EXPOSE 8080

# Runs: db bootstrap -> drizzle push -> start server
CMD ["npm", "start"]
