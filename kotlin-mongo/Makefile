IMAGE?=gcr.io/speedscale-demos/kotlin-mongo

.PHONY: build clean docker-multi

build:
	./gradlew bootJar -x test

clean:
	./gradlew clean

docker-multi:
	docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${IMAGE}:latest .
