# Build context is this directory: docker build -t tutorial-orders-go .
FROM golang:1.26.6-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/tutorial-orders .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates \
    && adduser -D -u 10001 app
USER app
COPY --from=build /out/tutorial-orders /usr/local/bin/tutorial-orders
EXPOSE 8080
ENTRYPOINT ["tutorial-orders"]
