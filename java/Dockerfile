FROM maven:3-amazoncorretto-20 as build
COPY ./server /usr/src/server
WORKDIR /usr/src/server
RUN mvn -q clean \
    && mvn -q -DskipTests package \
    && cp target/server-*.jar /app.jar

FROM amazoncorretto:20
COPY --from=build /app.jar /app.jar
ENTRYPOINT ["java", "-jar", "app.jar"]
