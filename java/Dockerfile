FROM --platform=$BUILDPLATFORM maven:3.9.12-amazoncorretto-25 AS build
WORKDIR /usr/src/server
COPY ./server/pom.xml ./
RUN mvn -B -q dependency:go-offline
COPY ./server/src ./src
RUN mvn -B -q -DskipTests package \
    && cp target/server-*.jar /app.jar

FROM amazoncorretto:25
COPY --from=build /app.jar /app.jar
ENTRYPOINT ["/bin/bash", "-c", "java $JAVA_OPTS $SPEEDSCALE_JAVA_OPTS -jar app.jar"]
