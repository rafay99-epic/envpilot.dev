# The published Envpilot image.
#
# One statically linked binary and nothing else — no shell, no package
# manager, no runtime. That is what lets `COPY --from` drop it into any base
# image a user happens to be on (alpine, python, golang, distroless) without
# dragging a Node install along with it.
#
# The binary is cross-compiled OUTSIDE this Dockerfile by
# .github/workflows/deploy-docker-image.yml, which runs `bun build --compile`
# once per target into build/<os>/<arch>/envpilot. Bun embeds a runtime per
# platform, so one binary cannot serve both architectures — buildx selects the
# right one here via TARGETOS/TARGETARCH and assembles the multi-arch
# manifest. Building this file by hand requires that tree to exist.
#
# The binary deliberately lands at /envpilot rather than on a PATH: users
# choose the name it takes in their own image, so it can never shadow the real
# envpilot CLI on a developer machine.
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

COPY build/${TARGETOS}/${TARGETARCH}/envpilot /envpilot

# Running the image directly prints usage. The real entrypoints are
# `COPY --from` for runtime and `--mount=from=` for build time.
ENTRYPOINT ["/envpilot"]
CMD ["--help"]
