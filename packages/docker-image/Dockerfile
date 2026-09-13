FROM scratch

ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev

LABEL org.opencontainers.image.title="Envpilot" \
      org.opencontainers.image.description="Pull Envpilot variables and secret files into a Docker build or a running container" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.vendor="Envpilot" \
      org.opencontainers.image.url="https://www.envpilot.dev" \
      org.opencontainers.image.documentation="https://docs.envpilot.dev/docker/overview" \
      org.opencontainers.image.source="https://github.com/rafay99-epic/envpilot-docker" \
      org.opencontainers.image.licenses="MIT"

COPY --from=gcr.io/distroless/static-debian12:nonroot /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

COPY build/${TARGETOS}/${TARGETARCH}/envpilot /envpilot

ENTRYPOINT ["/envpilot"]
CMD ["--help"]
