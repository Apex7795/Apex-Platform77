FROM node:20-slim

# psql is needed to run the db/migrate_*.sql files, both via the
# Pre-Deploy Command and via Render's Shell tab for one-time admin steps
# (e.g. db/migrate_rls_hardening.sql's app_user creation).
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 10000

CMD ["npm", "start"]
