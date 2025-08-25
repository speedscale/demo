FROM openjdk:17-jdk-alpine AS build

RUN apk add --no-cache maven

WORKDIR /app
COPY pom.xml .
COPY src ./src

RUN mvn clean compile dependency:copy-dependencies

FROM openjdk:17-jre-alpine

WORKDIR /app
COPY --from=build /app/target/classes ./classes
COPY --from=build /app/target/dependency ./libs

ENTRYPOINT ["java", "-cp", "classes:libs/*", "com.example.AuthClient"]