# Envpilot Docker Image

Pull environment variables and secret files from [Envpilot](https://www.envpilot.dev) into a Docker build or a running container.

One statically linked binary, no runtime dependencies and no libc. It works in any base image — `scratch`, distroless, `alpine` (musl), `python`, `golang`, `eclipse-temurin`, whatever you are already on.

```
ghcr.io/rafay99-epic/envpilot:1
```

## Quick start

**1. Create an API key.** Envpilot dashboard → Organization → Settings → API Keys → pick the **Docker** preset. Scope it to the project and environment it serves, and grant the `variables` resource (add `files` only if you need secret files).

Docker is its own surface: a key minted only for the REST API or the GitHub Action will not work here.

**2. Wrap your entrypoint.**

```dockerfile
FROM python:3.12-slim
COPY --from=ghcr.io/rafay99-epic/envpilot:1 /envpilot /usr/local/bin/envpilot
COPY . /app
WORKDIR /app

ENTRYPOINT ["envpilot", "exec", "--"]
CMD ["python", "app.py"]
```

**3. Pass the key at run time.**

```bash
docker run \
  -v /etc/envpilot/token:/run/secrets/envpilot_token:ro \
  -e ENVPILOT_TOKEN_FILE=/run/secrets/envpilot_token \
  -e ENVPILOT_PROJECT=checkout-api \
  -e ENVPILOT_ENVIRONMENT=production \
  myapp:latest
```

Your variables are in the process environment before `python app.py` starts. Nothing was written to disk.

## Commands

| Command                  | Does                                                            |
| ------------------------ | --------------------------------------------------------------- |
| `envpilot pull`          | Write variables as dotenv text. Stdout unless `--out` is given. |
| `envpilot files`         | Write secret files to their recorded paths at `0600`/`0400`.    |
| `envpilot exec -- <cmd>` | Inject variables into `<cmd>` and run it. Nothing touches disk. |

### Flags

| Flag              | Default                    | Meaning                                   |
| ----------------- | -------------------------- | ----------------------------------------- |
| `-p`, `--project` | `$ENVPILOT_PROJECT`        | Project slug                              |
| `-e`, `--env`     | `$ENVPILOT_ENVIRONMENT`    | Environment name                          |
| `-o`, `--out`     | stdout                     | `pull`: write here at `0600`              |
| `-d`, `--dir`     | working directory          | `files`: output directory                 |
| `--files`         | off                        | `exec`: write secret files before running |
| `--api-url`       | `https://www.envpilot.dev` | Override for a non-production instance    |
| `-q`, `--quiet`   | off                        | Suppress the progress line on stderr      |

### Credentials

| Variable              | Notes                                    |
| --------------------- | ---------------------------------------- |
| `ENVPILOT_TOKEN_FILE` | Path to a mounted secret. **Preferred.** |
| `ENVPILOT_TOKEN`      | The key inline.                          |

`ENVPILOT_TOKEN_FILE` wins when both are set. There is no `--token` flag on purpose: a credential on a command line shows up in `ps`, in shell history, and in build logs.

## Build-time secrets

Use a BuildKit mount. The binary never becomes part of your image, and the values never enter a layer or the image history.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app
COPY package.json bun.lock ./

RUN --mount=type=secret,id=envpilot_token \
    --mount=from=ghcr.io/rafay99-epic/envpilot:1,source=/envpilot,target=/envpilot \
    ENVPILOT_TOKEN_FILE=/run/secrets/envpilot_token \
    /envpilot exec --project checkout-api --env production -- npm ci
```

```bash
docker build --secret id=envpilot_token,src=./.envpilot-token .
```

Secret files work the same way. Write them, use them, delete them inside one `RUN` so they never reach a layer:

```dockerfile
RUN --mount=type=secret,id=envpilot_token \
    --mount=from=ghcr.io/rafay99-epic/envpilot:1,source=/envpilot,target=/envpilot \
    ENVPILOT_TOKEN_FILE=/run/secrets/envpilot_token \
    /envpilot files --project mobile --env production --dir /build \
 && ./gradlew assembleRelease \
 && rm -rf /build/*.jks
```

> **Never** put the key in an `ARG` or `ENV`. Build arguments persist in image history and travel to anyone who pulls the image.

## Docker Compose

```yaml
services:
  api:
    build: .
    environment:
      ENVPILOT_TOKEN_FILE: /run/secrets/envpilot_token
      ENVPILOT_PROJECT: checkout-api
      ENVPILOT_ENVIRONMENT: production
    secrets: [envpilot_token]

secrets:
  envpilot_token:
    file: ./.envpilot-token
```

## Runtime secret files

Certs, keystores and SSH keys land at their recorded paths just before your app starts:

```dockerfile
ENTRYPOINT ["envpilot", "exec", "--files", "--"]
CMD ["/server"]
```

The key needs the `files` resource, which is never granted by default.

## Exit codes

| Code         | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| `0`          | Success                                                    |
| `1`          | Request or write failure                                   |
| `2`          | Bad invocation (missing key, project, environment or flag) |
| child's code | `exec` exits with whatever your command exited with        |

`exec` forwards `SIGINT`, `SIGTERM`, `SIGHUP` and `SIGQUIT` to the child, so `docker stop` reaches your app normally. A child killed by a signal reports `128 + signal`, matching shell convention.

Failures are loud and total. A pull that cannot decrypt every variable aborts rather than handing your app a blank credential, because a container that refuses to start beats one running on half its configuration.

## Versions

Pin the floating major tag and you get non-breaking updates automatically:

```
ghcr.io/rafay99-epic/envpilot:1
```

Pin an exact version if you want to control upgrades yourself:

```
ghcr.io/rafay99-epic/envpilot:1.0.0
```

## Docs

Full documentation: **[docs.envpilot.dev/docker/overview](https://docs.envpilot.dev/docker/overview)**

## License

MIT
