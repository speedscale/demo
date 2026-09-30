package com.speedscale.tutorial;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Keeps every error in the contract's {"error":"..."} shape so Spring's own error pages never leak. */
public class ErrorHandling {

    static String messageFor(int status) {
        return switch (status) {
            case 400 -> "bad request";
            case 404 -> "not found";
            case 405 -> "method not allowed";
            default -> "internal error";
        };
    }

    @RestControllerAdvice
    static class Advice {
        private static final Logger LOG = LoggerFactory.getLogger(Advice.class);
        private final ObjectMapper mapper;

        Advice(ObjectMapper mapper) {
            this.mapper = mapper;
        }

        @ExceptionHandler(ApiException.class)
        ResponseEntity<byte[]> api(ApiException e) {
            return error(e.status(), e.getMessage());
        }

        @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
        ResponseEntity<byte[]> notFound(Exception e) {
            return error(404, "not found");
        }

        @ExceptionHandler(HttpMessageNotReadableException.class)
        ResponseEntity<byte[]> unreadable(HttpMessageNotReadableException e) {
            return error(400, "invalid JSON body");
        }

        @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
        ResponseEntity<byte[]> wrongMethod(HttpRequestMethodNotSupportedException e) {
            ResponseEntity<byte[]> base = error(405, "method not allowed");
            HttpHeaders headers = new HttpHeaders();
            headers.putAll(base.getHeaders());
            if (e.getSupportedHttpMethods() != null) {
                headers.setAllow(e.getSupportedHttpMethods());
            }
            return new ResponseEntity<>(base.getBody(), headers, base.getStatusCode());
        }

        @ExceptionHandler(Exception.class)
        ResponseEntity<byte[]> unexpected(Exception e) {
            LOG.error("unhandled error", e);
            return error(500, "internal error");
        }

        private ResponseEntity<byte[]> error(int status, String message) {
            return OrdersController.jsonResponse(mapper, status, new Views.Error(message));
        }
    }

    /** Replaces Spring Boot's /error page for anything that fails before or outside a controller. */
    @org.springframework.stereotype.Controller
    static class JsonErrorController implements ErrorController {
        private final ObjectMapper mapper;

        JsonErrorController(ObjectMapper mapper) {
            this.mapper = mapper;
        }

        @RequestMapping("/error")
        ResponseEntity<byte[]> error(HttpServletRequest request) {
            Object code = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
            int status = code instanceof Integer i ? i : 500;
            return OrdersController.jsonResponse(mapper, status, new Views.Error(messageFor(status)));
        }
    }
}
