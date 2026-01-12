# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* .npmrc* ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies (keeps image lean-ish while allowing db scripts)
COPY package.json package-lock.json* .npmrc* ./
RUN npm ci --omit=dev

# App runtime artifacts
COPY --from=build /app/dist ./dist
COPY --from=build /app/script ./script
COPY --from=build /app/shared ./shared
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts

EXPOSE 5000
CMD ["npm", "run", "start"]
