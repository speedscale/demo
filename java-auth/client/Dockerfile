FROM alpine:latest

RUN apk add --no-cache bash curl jq

COPY client /client
RUN chmod +x /client

ENTRYPOINT ["/client"]