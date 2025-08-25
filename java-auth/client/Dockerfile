FROM maven:3-amazoncorretto-20 AS build

WORKDIR /app
COPY pom.xml .
COPY src ./src

RUN mvn clean compile dependency:copy-dependencies

FROM amazoncorretto:20

WORKDIR /app
COPY --from=build /app/target/classes ./classes
COPY --from=build /app/target/dependency ./libs

ENTRYPOINT ["java", "-cp", "classes:libs/*", "com.example.AuthClient"]