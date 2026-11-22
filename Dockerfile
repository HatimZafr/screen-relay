ARG BASE_IMAGE=node:26-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc
FROM ${BASE_IMAGE}

COPY . /opt/relay-src
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini procps \
    && useradd --create-home --shell /bin/bash relay \
    && cd /opt/relay-src \
    && npm ci --ignore-scripts \
    && npm run build \
    && npm install -g "$(npm pack)" \
    && HOME=/home/relay screen-relay install --yes \
    && chown -R relay:relay /home/relay \
    && npm run typecheck \
    && npm test \
    && apt-get install -y --no-install-recommends libavcodec-dev libavutil-dev libswscale-dev \
    && make -C /opt/relay-src test clean \
    && rm -rf /opt/relay-src /root/.npm /var/lib/apt/lists/* \
    && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

USER relay
WORKDIR /home/relay
EXPOSE 8080
ENTRYPOINT ["tini", "--", "screen-relay", "up", "--bind", "0.0.0.0"]
