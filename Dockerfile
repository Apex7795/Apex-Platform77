FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 10000

CMD ["npm", "start"]
