package com.speedscale.tutorial;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

@RestController
public class OrdersController {

    private final OrderService service;
    private final ObjectMapper mapper;

    public OrdersController(OrderService service, ObjectMapper mapper) {
        this.service = service;
        this.mapper = mapper;
    }

    @GetMapping("/healthz")
    ResponseEntity<byte[]> healthz() {
        return json(200, service.health());
    }

    @GetMapping("/catalog")
    ResponseEntity<byte[]> catalog() {
        return json(200, service.catalog());
    }

    @PostMapping("/orders")
    ResponseEntity<byte[]> create(HttpServletRequest request) throws IOException {
        OrderRequest parsed = OrderRequest.parse(request.getInputStream().readAllBytes());
        return json(201, service.create(parsed));
    }

    @GetMapping("/orders/{id}")
    ResponseEntity<byte[]> get(@PathVariable String id) {
        return json(200, service.getOrder(id));
    }

    @GetMapping("/orders/{id}/status")
    ResponseEntity<byte[]> status(@PathVariable String id) {
        return json(200, service.getStatus(id));
    }

    @GetMapping("/orders")
    ResponseEntity<byte[]> list() {
        return json(200, service.listRecent());
    }

    ResponseEntity<byte[]> json(int status, Object body) {
        return jsonResponse(mapper, status, body);
    }

    static ResponseEntity<byte[]> jsonResponse(ObjectMapper mapper, int status, Object body) {
        try {
            return ResponseEntity.status(HttpStatusCode.valueOf(status))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(mapper.writeValueAsString(body).getBytes(StandardCharsets.UTF_8));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
