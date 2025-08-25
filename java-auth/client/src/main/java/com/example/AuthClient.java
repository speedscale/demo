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
        try {
            authClient.run();
        } catch (Exception e) {
            System.err.println("Client error: " + e.getMessage());
            System.exit(1);
        }
    }
    
    public void run() throws InterruptedException {
        try {
            // Initial login
            login();
            
            int iteration = 1;
            while (true) {
                System.out.println("\n=== Iteration " + iteration + " ===");
                
                // Test protected endpoint
                if (!testProtectedEndpoint()) {
                    System.out.println("Retrying after token refresh...");
                    refreshToken();
                    testProtectedEndpoint();
                }
                
                // Refresh token every 5 iterations
                if (iteration % 5 == 0) {
                    refreshToken();
                }
                
                // Sleep between iterations
                Thread.sleep(2000 + random.nextInt(3000)); // 2-5 seconds
                iteration++;
            }
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            throw e;
        }
    }
    
    private void login() throws IOException {
        System.out.println("Logging in...");
        
        RequestBody body = RequestBody.create(
            "{\"username\":\"demo\",\"password\":\"password\"}",
            MediaType.get("application/json")
        );
        
        Request request = new Request.Builder()
                .url(SERVER_URL + "/api/auth/login")
                .post(body)
                .build();
        
        try (Response response = client.newCall(request).execute()) {
            if (response.code() == 401) {
                throw new RuntimeException("Login failed: Invalid credentials (HTTP 401)");
            } else if (!response.isSuccessful()) {
                throw new RuntimeException("Login failed (HTTP " + response.code() + "): " + response.body().string());
            }
            
            String responseBody = response.body().string();
            JsonNode json = mapper.readTree(responseBody);
            
            this.accessToken = json.get("accessToken").asText();
            this.refreshToken = json.get("refreshToken").asText();
            
            if (accessToken == null || accessToken.isEmpty()) {
                throw new RuntimeException("Login failed: No access token received");
            }
            
            System.out.println("✓ Login successful");
            System.out.println("  Access token: " + accessToken.substring(0, Math.min(20, accessToken.length())) + "...");
        }
    }
    
    private boolean testProtectedEndpoint() {
        System.out.println("Testing protected endpoint...");
        
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
        } catch (IOException e) {
            System.out.println("✗ Request failed: " + e.getMessage());
            return false;
        }
    }
    
    private void refreshToken() throws IOException {
        System.out.println("Refreshing token...");
        
        RequestBody body = RequestBody.create(
            "{\"refreshToken\":\"" + refreshToken + "\"}",
            MediaType.get("application/json")
        );
        
        Request request = new Request.Builder()
                .url(SERVER_URL + "/api/auth/refresh")
                .post(body)
                .build();
        
        try (Response response = client.newCall(request).execute()) {
            if (response.code() == 401) {
                System.out.println("✗ Token refresh failed: Refresh token expired (HTTP 401)");
                System.out.println("Re-authenticating...");
                login();
                return;
            } else if (!response.isSuccessful()) {
                System.out.println("✗ Token refresh failed (HTTP " + response.code() + ")");
                System.out.println("Re-authenticating...");
                login();
                return;
            }
            
            String responseBody = response.body().string();
            JsonNode json = mapper.readTree(responseBody);
            
            this.accessToken = json.get("accessToken").asText();
            this.refreshToken = json.get("refreshToken").asText();
            
            System.out.println("✓ Token refreshed successfully");
            System.out.println("  New access token: " + accessToken.substring(0, Math.min(20, accessToken.length())) + "...");
        }
    }
}