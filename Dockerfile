FROM node:14

RUN useradd --create-home --home-dir /app app

USER app
WORKDIR /app
COPY --chown=app:app . .

RUN npm ci --production
CMD npm run watch
