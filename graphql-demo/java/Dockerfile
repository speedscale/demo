# Runtime JDK patch level. The fast lane check builds the deployed and the patched tag.
ARG CORRETTO_TAG=21.0.13

FROM maven:3-amazoncorretto-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B package

FROM amazoncorretto:${CORRETTO_TAG}
COPY --from=build /app/target/graphql-demo.jar /app/graphql-demo.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/graphql-demo.jar"]
