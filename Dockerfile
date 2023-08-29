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

# Substage that creates the services file (so we don't need to install in the published image)
FROM debian:bookworm-slim as servicesJson
ARG ENDPOINT
ENV DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-O", "dotglob", "-c"]

RUN apt update && apt install -y jq;
RUN jq --null-input \
        --arg endpoint "${ENDPOINT}" \
        --arg type "SPARQLEndpointService" \
        --arg graph "https://data.meemoo.be/graphs/organization" \
         '{"endpoint": $endpoint, "type": $type, "graph": $graph}' \
        > /services.json





FROM node:18-bookworm-slim
ARG GRASP_CONFIG 
ENV RESOURCES_DIR="./grasp-config/${GRASP_CONFIG}" \
    SERVICES_FILE="/app/services.json"
EXPOSE 4000
SHELL ["/bin/bash", "-O", "dotglob", "-c"]
WORKDIR /app
CMD node main.js
COPY --chown=node:node --from=servicesJson /services.json ${SERVICES_FILE}
COPY --chown=node:node --from=build /build /app
RUN chown node:node /app
USER node
RUN cd /app && npm ci omit=dev
