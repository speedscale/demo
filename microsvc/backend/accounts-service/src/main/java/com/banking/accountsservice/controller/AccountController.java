package com.banking.accountsservice.controller;

import com.banking.accountsservice.dto.AccountCreateRequest;
import com.banking.accountsservice.dto.AccountResponse;
import com.banking.accountsservice.dto.BalanceResponse;
import com.banking.accountsservice.security.UserAuthenticationDetails;
import com.banking.accountsservice.service.AccountService;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/accounts")
public class AccountController {
    
    private static final Logger logger = LoggerFactory.getLogger(AccountController.class);
    
    @Autowired
    private AccountService accountService;
    
    @Autowired
    private Tracer tracer;
    
    
    @GetMapping
    public ResponseEntity<List<AccountResponse>> getUserAccounts(Authentication authentication) {
        Span span = tracer.spanBuilder("get-user-accounts").startSpan();
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            logger.info("Fetching accounts for user: {}", userId);
            
            List<AccountResponse> accounts = accountService.getUserAccounts(userId);
            span.setAttribute("user.id", userId);
            span.setAttribute("accounts.count", accounts.size());
            
            return ResponseEntity.ok(accounts);
        } catch (Exception e) {
            span.recordException(e);
            logger.error("Error fetching accounts", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        } finally {
            span.end();
        }
    }
    
    @PostMapping
    public ResponseEntity<AccountResponse> createAccount(
            @Valid @RequestBody AccountCreateRequest request,
            Authentication authentication) {
        Span span = tracer.spanBuilder("create-account").startSpan();
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            logger.info("Creating account for user: {}", userId);
            
            AccountResponse account = accountService.createAccount(request, userId);
            span.setAttribute("user.id", userId);
            span.setAttribute("account.type", request.getAccountType());
            span.setAttribute("account.number", account.getAccountNumber());
            
            return ResponseEntity.status(HttpStatus.CREATED).body(account);
        } catch (Exception e) {
            span.recordException(e);
            logger.error("Error creating account", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        } finally {
            span.end();
        }
    }
    
    @GetMapping("/{accountId}")
    public ResponseEntity<AccountResponse> getAccountById(
            @PathVariable Long accountId,
            Authentication authentication) {
        Span span = tracer.spanBuilder("get-account-by-id").startSpan();
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            logger.info("Fetching account {} for user: {}", accountId, userId);
            
            AccountResponse account = accountService.getAccountById(accountId, userId);
            span.setAttribute("user.id", userId);
            span.setAttribute("account.id", accountId);
            span.setAttribute("account.number", account.getAccountNumber());
            
            return ResponseEntity.ok(account);
        } catch (RuntimeException e) {
            span.recordException(e);
            logger.error("Account not found or access denied", e);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        } catch (Exception e) {
            span.recordException(e);
            logger.error("Error fetching account", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        } finally {
            span.end();
        }
    }
    
    @GetMapping("/{accountId}/balance")
    public ResponseEntity<BalanceResponse> getAccountBalance(
            @PathVariable Long accountId,
            Authentication authentication) {
        Span span = tracer.spanBuilder("get-account-balance").startSpan();
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            logger.info("Fetching balance for account {} for user: {}", accountId, userId);
            
            BalanceResponse balance = accountService.getAccountBalance(accountId, userId);
            span.setAttribute("user.id", userId);
            span.setAttribute("account.id", accountId);
            span.setAttribute("account.number", balance.getAccountNumber());
            
            return ResponseEntity.ok(balance);
        } catch (RuntimeException e) {
            span.recordException(e);
            logger.error("Account not found or access denied", e);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        } catch (Exception e) {
            span.recordException(e);
            logger.error("Error fetching account balance", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        } finally {
            span.end();
        }
    }
    
    @PutMapping("/{accountId}/balance")
    public ResponseEntity<Void> updateAccountBalance(
            @PathVariable Long accountId,
            @RequestBody Map<String, Object> requestBody,
            Authentication authentication) {
        Span span = tracer.spanBuilder("update-account-balance").startSpan();
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            logger.info("Updating balance for account {} for user: {}", accountId, userId);
            
            Object balanceObj = requestBody.get("balance");
            if (!(balanceObj instanceof Number)) {
                return ResponseEntity.badRequest().build();
            }
            
            BigDecimal newBalance = new BigDecimal(balanceObj.toString());
            accountService.updateBalance(accountId, newBalance, userId);
            
            span.setAttribute("user.id", userId);
            span.setAttribute("account.id", accountId);
            
            return ResponseEntity.ok().build();
        } catch (RuntimeException e) {
            span.recordException(e);
            logger.error("Account not found or access denied", e);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        } catch (Exception e) {
            span.recordException(e);
            logger.error("Error updating account balance", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        } finally {
            span.end();
        }
    }
    
    private Long getUserIdFromAuthentication(Authentication authentication) {
        UserAuthenticationDetails details = (UserAuthenticationDetails) authentication.getDetails();
        return details.getUserId();
    }
}