# Node LTS
ARG NODE_VERSION=22.14.0

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /usr/src/app
EXPOSE 4000

FROM base AS dev
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/home/node/.npm \
    npm ci --include=dev

USER node
COPY . .
CMD npm run migrate:up && npm run dev

FROM base AS prodbuilder
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/home/node/.npm \
    npm ci --only-production

RUN chown -R node:node /usr/src/app

USER node
COPY --chown=node:node . .
RUN npm run build && npm run build:knexfile

FROM base AS prodrunner
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && sed -i 's/\r$//' ./docker-entrypoint.sh && chown node:node ./docker-entrypoint.sh
USER node
COPY --from=prodbuilder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=prodbuilder --chown=node:node /usr/src/app/dist ./dist
COPY --from=prodbuilder --chown=node:node /usr/src/app/migrations ./migrations
COPY --from=prodbuilder --chown=node:node /usr/src/app/knexfile.js ./knexfile.js
COPY --from=prodbuilder --chown=node:node /usr/src/app/package.json ./package.json
ENTRYPOINT ["./docker-entrypoint.sh"]
