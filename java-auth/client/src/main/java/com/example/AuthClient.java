package com.example;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.*;

import java.io.IOException;
import java.util.Random;
import java.util.concurrent.TimeUnit;

public class AuthClient {
    private static final String SERVER_URL = System.getenv().getOrDefault("SERVER_URL", "http://localhost:8080");
    private static final ObjectMapper mapper = new ObjectMapper();
    private static final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build();
    
    private String accessToken;
    private String refreshToken;
    private final Random random = new Random();
    
    public static void main(String[] args) {
        System.out.println("Java Auth Client - Server URL: " + SERVER_URL);
        System.out.println("==================================");
        
        AuthClient authClient = new AuthClient();
        authClient.run();
    }
    
    public void run() {
        try {
            // Wait for server to be ready
            waitForServerReady();
            
            // Initial login
            if (!login()) {
                System.err.println("Failed initial login. Retrying with fallback credentials...");
                // Try fallback users
                if (!tryFallbackLogin()) {
                    System.err.println("All login attempts failed. Will continue retrying...");
                }
            }
            
            int iteration = 1;
            int consecutiveFailures = 0;
            
            while (true) {
                System.out.println("\n=== Iteration " + iteration + " ===");
                
                try {
                    // Test protected endpoint
                    if (!testProtectedEndpoint()) {
                        System.out.println("Retrying after token refresh...");
                        if (refreshToken()) {
                            testProtectedEndpoint();
                        }
                    }
                    
                    // Refresh token every 5 iterations
                    if (iteration % 5 == 0) {
                        refreshToken();
                    }
                    
                    // Occasional invalid user test (every 20 iterations)
                    if (iteration % 20 == 0) {
                        testInvalidUser();
                    }
                    
                    consecutiveFailures = 0;
                    
                } catch (Exception e) {
                    consecutiveFailures++;
                    System.err.println("Error in iteration " + iteration + ": " + e.getMessage());
                    
                    // If too many consecutive failures, try to re-authenticate
                    if (consecutiveFailures >= 3) {
                        System.out.println("Too many failures, attempting re-authentication...");
                        if (!login() && !tryFallbackLogin()) {
                            System.err.println("Re-authentication failed, continuing...");
                        } else {
                            consecutiveFailures = 0;
                        }
                    }
                }
                
                // Sleep between iterations
                try {
                    Thread.sleep(2000 + random.nextInt(3000)); // 2-5 seconds
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    System.out.println("Client interrupted, shutting down gracefully...");
                    break;
                }
                
                iteration++;
            }
        } catch (Exception e) {
            System.err.println("Fatal error: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    private void waitForServerReady() {
        System.out.println("Waiting for server to be ready...");
        int attempts = 0;
        int maxAttempts = 30;
        
        while (attempts < maxAttempts) {
            try {
                Request request = new Request.Builder()
                        .url(SERVER_URL + "/actuator/health")
                        .build();
                
                try (Response response = client.newCall(request).execute()) {
                    if (response.isSuccessful()) {
                        System.out.println("✓ Server is ready");
                        return;
                    }
                }
            } catch (IOException e) {
                // Server not ready yet
            }
            
            attempts++;
            System.out.println("Server not ready, waiting... (" + attempts + "/" + maxAttempts + ")");
            try {
                Thread.sleep(2000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
        System.out.println("Server may not be ready, proceeding anyway...");
    }
    
    private boolean login() {
        return loginWithCredentials("demo", "password");
    }
    
    private boolean tryFallbackLogin() {
        String[][] fallbackUsers = {
            {"testuser", "password123"},
            {"admin", "password123"},
            {"johndoe", "password123"}
        };
        
        for (String[] user : fallbackUsers) {
            System.out.println("Trying fallback user: " + user[0]);
            if (loginWithCredentials(user[0], user[1])) {
                return true;
            }
        }
        return false;
    }
    
    private boolean loginWithCredentials(String username, String password) {
        System.out.println("Logging in as: " + username);
        
        try {
            String jsonBody = String.format("{\"username\":\"%s\",\"password\":\"%s\"}", username, password);
            RequestBody body = RequestBody.create(jsonBody, MediaType.get("application/json; charset=utf-8"));
            
            Request request = new Request.Builder()
                    .url(SERVER_URL + "/api/auth/login")
                    .post(body)
                    .build();
            
            try (Response response = client.newCall(request).execute()) {
                if (response.code() == 401) {
                    System.out.println("✗ Login failed: Invalid credentials (HTTP 401)");
                    return false;
                } else if (!response.isSuccessful()) {
                    System.out.println("✗ Login failed (HTTP " + response.code() + "): " + response.body().string());
                    return false;
                }
                
                String responseBody = response.body().string();
                JsonNode json = mapper.readTree(responseBody);
                
                this.accessToken = json.get("accessToken").asText();
                this.refreshToken = json.get("refreshToken").asText();
                
                if (accessToken == null || accessToken.isEmpty()) {
                    System.out.println("✗ Login failed: No access token received");
                    return false;
                }
                
                System.out.println("✓ Login successful for user: " + username);
                System.out.println("  Access token: " + accessToken.substring(0, Math.min(20, accessToken.length())) + "...");
                return true;
            }
        } catch (IOException e) {
            System.out.println("✗ Login failed due to connection error: " + e.getMessage());
            return false;
        }
    }
    
    private void testInvalidUser() {
        System.out.println("Testing invalid user (expecting 401)...");
        
        try {
            String jsonBody = "{\"username\":\"invaliduser\",\"password\":\"wrongpassword\"}";
            RequestBody body = RequestBody.create(jsonBody, MediaType.get("application/json; charset=utf-8"));
            
            Request request = new Request.Builder()
                    .url(SERVER_URL + "/api/auth/login")
                    .post(body)
                    .build();
            
            try (Response response = client.newCall(request).execute()) {
                if (response.code() == 401) {
                    System.out.println("✓ Invalid user test passed (HTTP 401 as expected)");
                } else {
                    System.out.println("✗ Invalid user test failed - expected 401 but got " + response.code());
                }
            }
        } catch (IOException e) {
            System.out.println("✗ Invalid user test failed due to connection error: " + e.getMessage());
        }
    }
    
    private boolean testProtectedEndpoint() {
        System.out.println("Testing protected endpoint...");
        
        if (accessToken == null || accessToken.isEmpty()) {
            System.out.println("✗ No access token available");
            return false;
        }
        
        try {
            Request request = new Request.Builder()
                    .url(SERVER_URL + "/api/auth/user")
                    .addHeader("Authorization", "Bearer " + accessToken)
                    .build();
            
            try (Response response = client.newCall(request).execute()) {
                if (response.code() == 401) {
                    System.out.println("✗ Access denied: Token expired or invalid (HTTP 401)");
                    return false;
                } else if (response.isSuccessful()) {
                    String responseBody = response.body().string();
                    JsonNode json = mapper.readTree(responseBody);
                    System.out.println("✓ Protected endpoint access successful");
                    System.out.println("  User: " + json.get("username").asText());
                    return true;
                } else {
                    System.out.println("✗ Request failed (HTTP " + response.code() + "): " + response.body().string());
                    return false;
                }
            }
        } catch (IOException e) {
            System.out.println("✗ Request failed: " + e.getMessage());
            return false;
        }
    }
    
    private boolean refreshToken() {
        System.out.println("Refreshing token...");
        
        if (refreshToken == null || refreshToken.isEmpty()) {
            System.out.println("✗ No refresh token available");
            return false;
        }
        
        try {
            String jsonBody = String.format("{\"refreshToken\":\"%s\"}", refreshToken);
            RequestBody body = RequestBody.create(jsonBody, MediaType.get("application/json; charset=utf-8"));
            
            Request request = new Request.Builder()
                    .url(SERVER_URL + "/api/auth/refresh")
                    .post(body)
                    .build();
            
            try (Response response = client.newCall(request).execute()) {
                if (response.code() == 401) {
                    System.out.println("✗ Token refresh failed: Refresh token expired (HTTP 401)");
                    System.out.println("Re-authenticating...");
                    return login() || tryFallbackLogin();
                } else if (!response.isSuccessful()) {
                    System.out.println("✗ Token refresh failed (HTTP " + response.code() + ")");
                    System.out.println("Re-authenticating...");
                    return login() || tryFallbackLogin();
                }
                
                String responseBody = response.body().string();
                JsonNode json = mapper.readTree(responseBody);
                
                this.accessToken = json.get("accessToken").asText();
                this.refreshToken = json.get("refreshToken").asText();
                
                System.out.println("✓ Token refreshed successfully");
                System.out.println("  New access token: " + accessToken.substring(0, Math.min(20, accessToken.length())) + "...");
                return true;
            }
        } catch (IOException e) {
            System.out.println("✗ Token refresh failed due to connection error: " + e.getMessage());
            System.out.println("Re-authenticating...");
            return login() || tryFallbackLogin();
        }
    }
}