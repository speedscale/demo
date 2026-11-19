# Runtime JDK patch level. The fast lane check builds the deployed and the patched tag.
ARG CORRETTO_TAG=21.0.13

# Build stage
FROM maven:3-amazoncorretto-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests

# Runtime stage
FROM amazoncorretto:${CORRETTO_TAG}
RUN yum install -y shadow-utils && yum clean all
RUN groupadd -g 1001 spring && useradd -u 1001 -g spring -m spring
USER spring:spring
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8081/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]