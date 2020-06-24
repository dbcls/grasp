FROM node:12

RUN useradd --create-home app
RUN install --owner app --group app --directory /app

USER app
WORKDIR /app
COPY --chown=app:app . .

RUN npm install
CMD npm run watch
