package com.speedscale.demo

import org.slf4j.LoggerFactory
import org.springframework.boot.CommandLineRunner
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.context.annotation.Bean
import org.springframework.data.mongodb.core.ReactiveMongoTemplate
import reactor.core.publisher.Mono

@SpringBootApplication
class Application {

    private val log = LoggerFactory.getLogger(Application::class.java)

    @Bean
    fun onStartup(mongoTemplate: ReactiveMongoTemplate): CommandLineRunner = CommandLineRunner {
        mongoTemplate.mongoDatabase
            .flatMap { db ->
                Mono.from(db.runCommand(org.bson.Document("ping", 1)))
            }
            .doOnSuccess { log.info("MongoDB ping successful") }
            .doOnError { log.error("MongoDB ping failed", it) }
            .block()
    }
}

fun main(args: Array<String>) {
    runApplication<Application>(*args)
}
