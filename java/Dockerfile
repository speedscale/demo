FROM maven:3.9.12-amazoncorretto-25 AS build
COPY ./server /usr/src/server
WORKDIR /usr/src/server
RUN mvn -q clean \
    && mvn -q -DskipTests package \
    && cp target/server-*.jar /app.jar

FROM amazoncorretto:25
COPY --from=build /app.jar /app.jar
ENTRYPOINT ["/bin/bash", "-c", "java $JAVA_OPTS $SPEEDSCALE_JAVA_OPTS -jar app.jar"]
