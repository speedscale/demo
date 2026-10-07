FROM golang:1.26 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o go-sqlcommenter-demo .

FROM gcr.io/distroless/static:nonroot
COPY --from=builder /app/go-sqlcommenter-demo /go-sqlcommenter-demo
EXPOSE 8080
ENTRYPOINT ["/go-sqlcommenter-demo"]
