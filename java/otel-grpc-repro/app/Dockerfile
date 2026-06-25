FROM gradle:8.10.2-jdk17 AS build
WORKDIR /workspace
COPY settings.gradle build.gradle ./
COPY src ./src
RUN gradle --no-daemon clean shadowJar

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /workspace/build/libs/otel-grpc-repro-0.1.0.jar /app/otel-grpc-repro.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/otel-grpc-repro.jar"]
