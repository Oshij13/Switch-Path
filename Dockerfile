FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 python3-reportlab \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY packages/database/package.json packages/database/package-lock.json ./packages/database/
RUN npm ci --prefix packages/database --omit=dev

COPY . .

ENV NODE_ENV=production
ENV SWITCHPATH_PYTHON_BIN=python3

CMD ["node", "apps/api/src/server.ts"]
