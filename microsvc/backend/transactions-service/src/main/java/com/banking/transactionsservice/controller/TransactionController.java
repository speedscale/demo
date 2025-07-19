package com.banking.transactionsservice.controller;

import com.banking.transactionsservice.dto.*;
import com.banking.transactionsservice.security.UserAuthenticationDetails;
import com.banking.transactionsservice.service.TransactionService;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/transactions")
public class TransactionController {
    
    private static final Logger logger = LoggerFactory.getLogger(TransactionController.class);
    
    @Autowired
    private TransactionService transactionService;
    
    @Autowired
    private Tracer tracer;
    
    
    @GetMapping
    public ResponseEntity<List<TransactionResponse>> getUserTransactions(Authentication authentication) {
        Span span = tracer.spanBuilder("get-user-transactions").startSpan();
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            logger.info("Fetching transactions for user: {}", userId);
            
            List<TransactionResponse> transactions = transactionService.getUserTransactions(userId);
            span.setAttribute("user.id", userId);
            span.setAttribute("transactions.count", transactions.size());
            
            return ResponseEntity.ok(transactions);
        } catch (Exception e) {
            span.recordException(e);
            logger.error("Error fetching transactions", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        } finally {
            span.end();
        }
    }
    
    @PostMapping("/deposit")
    public ResponseEntity<TransactionResponse> deposit(
            @Valid @RequestBody DepositRequest request,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        Span span = tracer.spanBuilder("process-deposit").startSpan();
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            String jwtToken = httpRequest.getHeader("Authorization");
            
            logger.info("Processing deposit for user: {}, account: {}, amount: {}", 
                       userId, request.getAccountId(), request.getAmount());
            
            TransactionResponse transaction = transactionService.deposit(request, userId, jwtToken);
            span.setAttribute("user.id", userId);
            span.setAttribute("account.id", request.getAccountId());
            span.setAttribute("transaction.amount", request.getAmount().toString());
            span.setAttribute("transaction.id", transaction.getId());
            
            return ResponseEntity.status(HttpStatus.CREATED).body(transaction);
        } catch (RuntimeException e) {
            span.recordException(e);
            logger.error("Deposit failed", e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        } catch (Exception e) {
            span.recordException(e);
            logger.error("Error processing deposit", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        } finally {
            span.end();
        }
    }
    
    @PostMapping("/withdraw")
    public ResponseEntity<TransactionResponse> withdraw(
            @Valid @RequestBody WithdrawRequest request,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        Span span = tracer.spanBuilder("process-withdrawal").startSpan();
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            String jwtToken = httpRequest.getHeader("Authorization");
            
            logger.info("Processing withdrawal for user: {}, account: {}, amount: {}", 
                       userId, request.getAccountId(), request.getAmount());
            
            TransactionResponse transaction = transactionService.withdraw(request, userId, jwtToken);
            span.setAttribute("user.id", userId);
            span.setAttribute("account.id", request.getAccountId());
            span.setAttribute("transaction.amount", request.getAmount().toString());
            span.setAttribute("transaction.id", transaction.getId());
            
            return ResponseEntity.status(HttpStatus.CREATED).body(transaction);
        } catch (RuntimeException e) {
            span.recordException(e);
            logger.error("Withdrawal failed", e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        } catch (Exception e) {
            span.recordException(e);
            logger.error("Error processing withdrawal", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        } finally {
            span.end();
        }
    }
    
    @PostMapping("/transfer")
    public ResponseEntity<TransactionResponse> transfer(
            @Valid @RequestBody TransferRequest request,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        Span span = tracer.spanBuilder("process-transfer").startSpan();
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            String jwtToken = httpRequest.getHeader("Authorization");
            
            logger.info("Processing transfer for user: {}, from: {}, to: {}, amount: {}", 
                       userId, request.getFromAccountId(), request.getToAccountId(), request.getAmount());
            
            TransactionResponse transaction = transactionService.transfer(request, userId, jwtToken);
            span.setAttribute("user.id", userId);
            span.setAttribute("from.account.id", request.getFromAccountId());
            span.setAttribute("to.account.id", request.getToAccountId());
            span.setAttribute("transaction.amount", request.getAmount().toString());
            span.setAttribute("transaction.id", transaction.getId());
            
            return ResponseEntity.status(HttpStatus.CREATED).body(transaction);
        } catch (RuntimeException e) {
            span.recordException(e);
            logger.error("Transfer failed", e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        } catch (Exception e) {
            span.recordException(e);
            logger.error("Error processing transfer", e);
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