FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
ARG NEXT_PUBLIC_CESIUM_ION_TOKEN
ARG NEXT_PUBLIC_TITILER_URL
ARG NEXT_PUBLIC_GLITCHTIP_DSN
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
ARG NEXT_PUBLIC_PHANTOM_ENDPOINT
ENV NEXT_PUBLIC_CESIUM_ION_TOKEN=${NEXT_PUBLIC_CESIUM_ION_TOKEN}
ENV NEXT_PUBLIC_TITILER_URL=${NEXT_PUBLIC_TITILER_URL}
ENV NEXT_PUBLIC_GLITCHTIP_DSN=${NEXT_PUBLIC_GLITCHTIP_DSN}
ENV NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=${NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE}
ENV NEXT_PUBLIC_PHANTOM_ENDPOINT=${NEXT_PUBLIC_PHANTOM_ENDPOINT}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
