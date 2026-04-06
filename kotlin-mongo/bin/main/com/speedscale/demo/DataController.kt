package com.speedscale.demo

import com.mongodb.ReadConcern
import com.mongodb.WriteConcern
import org.bson.Document
import org.slf4j.LoggerFactory
import org.springframework.data.mongodb.core.ReactiveMongoTemplate
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
import java.security.SecureRandom
import java.util.Base64

@RestController
class DataController(private val mongoTemplate: ReactiveMongoTemplate) {

    private val log = LoggerFactory.getLogger(DataController::class.java)
    private val random = SecureRandom()

    companion object {
        private const val COLLECTION = "ImmortaleIntegrationTestApp__IntegrationTestCase"
    }

    // POST /v3/{tid}/data
    @PostMapping("/v3/{tid}/data")
    fun createData(
        @PathVariable tid: String,
        @RequestHeader("Model-Id", required = false) modelId: String?,
        @RequestHeader("Model-Isolation-Id", required = false) modelIsolationId: String?,
        @RequestBody body: Map<String, Any>,
    ): Mono<ResponseEntity<Map<String, Any>>> {
        @Suppress("UNCHECKED_CAST")
        val data = body["data"] as? Map<String, Any> ?: return Mono.just(
            ResponseEntity.badRequest().build()
        )

        val classType = data["@class"] as? String ?: "Unknown"
        val id = generateId()

        val doc = Document()
            .append("_id", id)
            .append("version", 1)
            .append("type", classType)
            .append(
                "headers", Document()
                    .append("Model-ID", modelId ?: "")
                    .append("Model-Isolation-ID", modelIsolationId ?: "")
                    .append("AppData-Isolation-ID", tid)
            )
            .append("data", Document(data))

        return mongoTemplate.getCollection(COLLECTION)
            .flatMap { collection ->
                Mono.from(collection.insertOne(doc))
            }
            .map { _ ->
                val responseBody = mapOf(
                    "data" to data,
                    "version" to 1,
                )
                ResponseEntity.status(HttpStatus.CREATED)
                    .header("Location", "/v3/$tid/data/$id")
                    .body(responseBody)
            }
    }

    // GET /v3/{tid}/data/{id}
    @GetMapping("/v3/{tid}/data/{id}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getData(
        @PathVariable tid: String,
        @PathVariable id: String,
    ): Mono<ResponseEntity<Document>> {
        val pipeline = listOf(
            Document("\$match", Document("_id", id)),
            Document("\$limit", 500),
        )

        return mongoTemplate.getCollection(COLLECTION)
            .flatMap { collection ->
                Mono.from(
                    collection
                        .withReadConcern(ReadConcern.MAJORITY)
                        .aggregate(pipeline)
                        .allowDiskUse(true)
                        .batchSize(64)
                        .first()
                )
            }
            .map { doc -> ResponseEntity.ok(doc) }
            .defaultIfEmpty(ResponseEntity.notFound().build())
    }

    // GET /v3/{tid}/data-pages/{class}
    @GetMapping(
        "/v3/{tid}/data-pages/{className}",
        produces = ["application/stream+json"],
    )
    fun getDataPages(
        @PathVariable tid: String,
        @PathVariable className: String,
        @RequestParam params: Map<String, String>,
    ): Flux<Document> {
        val matchDoc = Document()

        for ((key, value) in params) {
            when (key) {
                "ID" -> matchDoc.append("_id", value)
                "Urgency" -> matchDoc.append("data.PegaPlatform__Urgency", value.toIntOrNull() ?: value)
                else -> matchDoc.append("data.PegaPlatform__$key", value)
            }
        }

        val pipeline = listOf(
            Document("\$match", matchDoc),
            Document("\$limit", 5000),
        )

        return mongoTemplate.getCollection(COLLECTION)
            .flatMapMany { collection ->
                Flux.from(
                    collection
                        .withReadConcern(ReadConcern.MAJORITY)
                        .aggregate(pipeline)
                        .allowDiskUse(true)
                        .batchSize(64)
                )
            }
    }

    // DELETE /v3/{tid}/data/{id}
    @DeleteMapping("/v3/{tid}/data/{id}")
    fun deleteData(
        @PathVariable tid: String,
        @PathVariable id: String,
        @RequestHeader("Version", required = false, defaultValue = "1") version: String,
    ): Mono<ResponseEntity<Void>> {
        val versionInt = version.toIntOrNull() ?: 1
        val filter = Document(
            "\$and", listOf(
                Document("_id", id),
                Document("version", versionInt),
            )
        )

        return mongoTemplate.getCollection(COLLECTION)
            .flatMap { collection ->
                Mono.from(
                    collection
                        .withWriteConcern(WriteConcern.MAJORITY)
                        .deleteOne(filter)
                )
            }
            .map { ResponseEntity.noContent().build<Void>() }
    }

    private fun generateId(): String {
        val bytes = ByteArray(18)
        random.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
}
