FROM golang:1.24 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o mongo-demo .

FROM gcr.io/distroless/static:nonroot
COPY --from=builder /app/mongo-demo /mongo-demo
EXPOSE 8080
ENTRYPOINT ["/mongo-demo"]
