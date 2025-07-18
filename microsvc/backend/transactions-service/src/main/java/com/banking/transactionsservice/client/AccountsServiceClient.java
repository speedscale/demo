package com.banking.transactionsservice.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

@Component
public class AccountsServiceClient {
    
    private static final Logger logger = LoggerFactory.getLogger(AccountsServiceClient.class);
    
    @Value("${accounts.service.url:http://localhost:8082}")
    private String accountsServiceUrl;
    
    private final RestTemplate restTemplate;
    
    public AccountsServiceClient() {
        this.restTemplate = new RestTemplate();
    }
    
    public boolean validateAccountOwnership(Long accountId, Long userId, String jwtToken) {
        try {
            String url = accountsServiceUrl + "/api/accounts/" + accountId;
            
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(jwtToken.replace("Bearer ", ""));
            HttpEntity<String> entity = new HttpEntity<>(headers);
            
            ResponseEntity<Map> response = restTemplate.exchange(
                url, HttpMethod.GET, entity, Map.class);
            
            return response.getStatusCode() == HttpStatus.OK;
        } catch (RestClientException e) {
            logger.error("Error validating account ownership for account {} and user {}: {}", 
                        accountId, userId, e.getMessage());
            return false;
        }
    }
    
    public BigDecimal getAccountBalance(Long accountId, String jwtToken) {
        try {
            String url = accountsServiceUrl + "/api/accounts/" + accountId + "/balance";
            
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(jwtToken.replace("Bearer ", ""));
            HttpEntity<String> entity = new HttpEntity<>(headers);
            
            ResponseEntity<Map> response = restTemplate.exchange(
                url, HttpMethod.GET, entity, Map.class);
            
            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                Object balanceObj = response.getBody().get("balance");
                if (balanceObj instanceof Number) {
                    return new BigDecimal(balanceObj.toString());
                }
            }
            return null;
        } catch (RestClientException e) {
            logger.error("Error getting account balance for account {}: {}", accountId, e.getMessage());
            return null;
        }
    }
    
    public boolean updateAccountBalance(Long accountId, BigDecimal newBalance, String jwtToken) {
        try {
            String url = accountsServiceUrl + "/api/accounts/" + accountId + "/balance";
            
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(jwtToken.replace("Bearer ", ""));
            headers.setContentType(MediaType.APPLICATION_JSON);
            
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("balance", newBalance);
            
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            
            ResponseEntity<Void> response = restTemplate.exchange(
                url, HttpMethod.PUT, entity, Void.class);
            
            return response.getStatusCode() == HttpStatus.OK;
        } catch (RestClientException e) {
            logger.error("Error updating account balance for account {}: {}", accountId, e.getMessage());
            return false;
        }
    }
}