# Substage that installs dev deps, and builds the js files
FROM node:18-bookworm-slim as build
SHELL ["/bin/bash", "-O", "dotglob", "-c"]
# Only copy these files, to avoid busting the docker build cache too often
COPY ./package.json ./package-lock.json /build/
RUN cd /build && npm ci
COPY . /copy
RUN cp -r /copy/* /build \
    && cd /build && npm run build \
    # Remove the node_modules, so we can copy this folder from the substage and (later) install only the prod deps
    && rm -r /build/node_modules



FROM node:18-bookworm-slim
ARG GRASP_CONFIG 
ENV RESOURCES_DIR="./grasp-config/${GRASP_CONFIG}" 
EXPOSE 4000
SHELL ["/bin/bash", "-O", "dotglob", "-c"]
WORKDIR /app
CMD node main.js
COPY --chown=node:node --from=build /build /app
RUN chown node:node /app
USER node
RUN cd /app && npm ci omit=dev
# Validate the configuration file
RUN node ./validateConfig.js
