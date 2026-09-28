FROM golang:1.26 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o go-mysql-demo .

FROM gcr.io/distroless/static:nonroot
COPY --from=builder /app/go-mysql-demo /go-mysql-demo
EXPOSE 8080
ENTRYPOINT ["/go-mysql-demo"]
