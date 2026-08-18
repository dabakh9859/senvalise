# syntax=docker/dockerfile:1
FROM golang:1.24-alpine AS api-build
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum* ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/senvalise ./cmd/server

FROM node:22-alpine AS web-build
WORKDIR /src
COPY package*.json ./
RUN npm install
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM alpine:3.22 AS api
RUN apk add --no-cache ca-certificates tzdata && adduser -D -H -u 10001 app
COPY --from=api-build /out/senvalise /usr/local/bin/senvalise
USER app
EXPOSE 8080
ENTRYPOINT ["senvalise"]

FROM nginx:1.29-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /src/dist /usr/share/nginx/html
EXPOSE 80
