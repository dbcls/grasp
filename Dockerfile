FROM node:16

RUN useradd --create-home --home-dir /app app

USER app
WORKDIR /app
COPY --chown=app:0 . .
RUN chmod g+w /app
RUN npm i
RUN npm run build
RUN npm ci --omit=dev
USER root 
RUN chown app:0 -R /app && chmod g+w -R /app
USER app
CMD npm run start
