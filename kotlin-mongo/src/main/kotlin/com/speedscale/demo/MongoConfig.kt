package com.speedscale.demo

import com.mongodb.reactivestreams.client.MongoClient
import com.mongodb.reactivestreams.client.MongoClients
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.mongodb.ReactiveMongoDatabaseFactory
import org.springframework.data.mongodb.core.ReactiveMongoTemplate
import org.springframework.data.mongodb.core.SimpleReactiveMongoDatabaseFactory

@Configuration
class MongoConfig(
    @Value("\${spring.data.mongodb.uri}") private val mongoUri: String,
    @Value("\${spring.data.mongodb.database}") private val databaseName: String,
) {

    @Bean
    fun reactiveMongoClient(): MongoClient = MongoClients.create(mongoUri)

    @Bean
    fun reactiveMongoDatabaseFactory(mongoClient: MongoClient): ReactiveMongoDatabaseFactory =
        SimpleReactiveMongoDatabaseFactory(mongoClient, databaseName)

    @Bean
    fun reactiveMongoTemplate(factory: ReactiveMongoDatabaseFactory): ReactiveMongoTemplate =
        ReactiveMongoTemplate(factory)
}
