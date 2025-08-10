FROM golang:alpine AS builder
WORKDIR /app
COPY assets/ ./assets/
COPY web/ ./web/
COPY go.mod main.go version.go ./

RUN go get -u ./...
RUN go build -v ./...
RUN CGO_ENABLED=0 go build -mod vendor -ldflags "-X main.goos=linux -X main.goarch=amd64" -o dropshipper-ui-linux-amd64 -tags "static" -tags timetzdata main.go

FROM scratch
COPY --from=builder /app/dropshipper-ui-linux-amd64 /dropshipper
COPY ./assets/ ./assets/
COPY ./web/ /web/
EXPOSE 8080
ENTRYPOINT ["/dropshipper"]