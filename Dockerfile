FROM node:lts

RUN useradd --create-home --home-dir /app app

USER app
WORKDIR /app
COPY --chown=app:0 . .
RUN chmod g+w /app
RUN npm ci --production
USER root 
RUN chown app:0 -R /app && chmod g+w -R /app
USER app
CMD npm run watch
