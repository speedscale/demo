# Single image, multi-role: ROLE selects gateway | cart | pricing | tax |
# payment | shipping | loadgen at runtime (see k8s manifests).
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY app/go.mod ./
RUN go mod download
COPY app/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /trace-demo .

FROM gcr.io/distroless/static-debian12
COPY --from=build /trace-demo /trace-demo
EXPOSE 8080
ENTRYPOINT ["/trace-demo"]
