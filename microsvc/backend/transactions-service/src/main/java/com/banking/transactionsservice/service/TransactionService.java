package com.banking.transactionsservice.service;

import com.banking.transactionsservice.client.AccountsServiceClient;
import com.banking.transactionsservice.dto.*;
import com.banking.transactionsservice.entity.Transaction;
import com.banking.transactionsservice.repository.TransactionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@Transactional
public class TransactionService {
    
    private static final Logger logger = LoggerFactory.getLogger(TransactionService.class);
    
    @Autowired
    private TransactionRepository transactionRepository;
    
    @Autowired
    private AccountsServiceClient accountsServiceClient;
    
    public List<TransactionResponse> getUserTransactions(Long userId) {
        logger.info("Fetching transactions for user: {}", userId);
        List<Transaction> transactions = transactionRepository.findByUserIdOrderByCreatedAtDesc(userId);
        return transactions.stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());
    }
    
    public TransactionResponse deposit(DepositRequest request, Long userId, String jwtToken) {
        logger.info("Processing deposit for user: {}, account: {}, amount: {}", 
                   userId, request.getAccountId(), request.getAmount());
        
        // Validate account ownership
        if (!accountsServiceClient.validateAccountOwnership(request.getAccountId(), userId, jwtToken)) {
            throw new RuntimeException("Account not found or access denied");
        }
        
        // Get current balance
        BigDecimal currentBalance = accountsServiceClient.getAccountBalance(request.getAccountId(), jwtToken);
        if (currentBalance == null) {
            throw new RuntimeException("Unable to retrieve account balance");
        }
        
        // Create transaction record
        Transaction transaction = new Transaction(
            userId, 
            null, 
            request.getAccountId(), 
            request.getAmount(),
            Transaction.TransactionType.DEPOSIT,
            request.getDescription()
        );
        
        try {
            // Calculate new balance
            BigDecimal newBalance = currentBalance.add(request.getAmount());
            
            // Update account balance
            if (!accountsServiceClient.updateAccountBalance(request.getAccountId(), newBalance, jwtToken)) {
                throw new RuntimeException("Failed to update account balance");
            }
            
            // Mark transaction as completed
            transaction.setStatus(Transaction.TransactionStatus.COMPLETED);
            transaction.setProcessedAt(LocalDateTime.now());
            
            Transaction savedTransaction = transactionRepository.save(transaction);
            logger.info("Deposit completed successfully for transaction: {}", savedTransaction.getId());
            
            return convertToResponse(savedTransaction);
        } catch (Exception e) {
            // Mark transaction as failed
            transaction.setStatus(Transaction.TransactionStatus.FAILED);
            transaction.setProcessedAt(LocalDateTime.now());
            transactionRepository.save(transaction);
            
            logger.error("Deposit failed for user: {}, account: {}", userId, request.getAccountId(), e);
            throw new RuntimeException("Deposit transaction failed: " + e.getMessage());
        }
    }
    
    public TransactionResponse withdraw(WithdrawRequest request, Long userId, String jwtToken) {
        logger.info("Processing withdrawal for user: {}, account: {}, amount: {}", 
                   userId, request.getAccountId(), request.getAmount());
        
        // Validate account ownership
        if (!accountsServiceClient.validateAccountOwnership(request.getAccountId(), userId, jwtToken)) {
            throw new RuntimeException("Account not found or access denied");
        }
        
        // Get current balance
        BigDecimal currentBalance = accountsServiceClient.getAccountBalance(request.getAccountId(), jwtToken);
        if (currentBalance == null) {
            throw new RuntimeException("Unable to retrieve account balance");
        }
        
        // Check sufficient balance
        if (currentBalance.compareTo(request.getAmount()) < 0) {
            throw new RuntimeException("Insufficient balance for withdrawal");
        }
        
        // Create transaction record
        Transaction transaction = new Transaction(
            userId, 
            request.getAccountId(), 
            null, 
            request.getAmount(),
            Transaction.TransactionType.WITHDRAWAL,
            request.getDescription()
        );
        
        try {
            // Calculate new balance
            BigDecimal newBalance = currentBalance.subtract(request.getAmount());
            
            // Update account balance
            if (!accountsServiceClient.updateAccountBalance(request.getAccountId(), newBalance, jwtToken)) {
                throw new RuntimeException("Failed to update account balance");
            }
            
            // Mark transaction as completed
            transaction.setStatus(Transaction.TransactionStatus.COMPLETED);
            transaction.setProcessedAt(LocalDateTime.now());
            
            Transaction savedTransaction = transactionRepository.save(transaction);
            logger.info("Withdrawal completed successfully for transaction: {}", savedTransaction.getId());
            
            return convertToResponse(savedTransaction);
        } catch (Exception e) {
            // Mark transaction as failed
            transaction.setStatus(Transaction.TransactionStatus.FAILED);
            transaction.setProcessedAt(LocalDateTime.now());
            transactionRepository.save(transaction);
            
            logger.error("Withdrawal failed for user: {}, account: {}", userId, request.getAccountId(), e);
            throw new RuntimeException("Withdrawal transaction failed: " + e.getMessage());
        }
    }
    
    public TransactionResponse transfer(TransferRequest request, Long userId, String jwtToken) {
        logger.info("Processing transfer for user: {}, from: {}, to: {}, amount: {}", 
                   userId, request.getFromAccountId(), request.getToAccountId(), request.getAmount());
        
        // Validate from account ownership
        if (!accountsServiceClient.validateAccountOwnership(request.getFromAccountId(), userId, jwtToken)) {
            throw new RuntimeException("From account not found or access denied");
        }
        
        // Get current balance of from account
        BigDecimal fromBalance = accountsServiceClient.getAccountBalance(request.getFromAccountId(), jwtToken);
        if (fromBalance == null) {
            throw new RuntimeException("Unable to retrieve from account balance");
        }
        
        // Check sufficient balance
        if (fromBalance.compareTo(request.getAmount()) < 0) {
            throw new RuntimeException("Insufficient balance for transfer");
        }
        
        // Get current balance of to account (validate it exists)
        BigDecimal toBalance = accountsServiceClient.getAccountBalance(request.getToAccountId(), jwtToken);
        if (toBalance == null) {
            throw new RuntimeException("To account not found or inaccessible");
        }
        
        // Create transaction record
        Transaction transaction = new Transaction(
            userId, 
            request.getFromAccountId(), 
            request.getToAccountId(), 
            request.getAmount(),
            Transaction.TransactionType.TRANSFER,
            request.getDescription()
        );
        
        try {
            // Calculate new balances
            BigDecimal newFromBalance = fromBalance.subtract(request.getAmount());
            BigDecimal newToBalance = toBalance.add(request.getAmount());
            
            // Update from account balance
            if (!accountsServiceClient.updateAccountBalance(request.getFromAccountId(), newFromBalance, jwtToken)) {
                throw new RuntimeException("Failed to update from account balance");
            }
            
            // Update to account balance
            if (!accountsServiceClient.updateAccountBalance(request.getToAccountId(), newToBalance, jwtToken)) {
                // Rollback from account balance
                accountsServiceClient.updateAccountBalance(request.getFromAccountId(), fromBalance, jwtToken);
                throw new RuntimeException("Failed to update to account balance");
            }
            
            // Mark transaction as completed
            transaction.setStatus(Transaction.TransactionStatus.COMPLETED);
            transaction.setProcessedAt(LocalDateTime.now());
            
            Transaction savedTransaction = transactionRepository.save(transaction);
            logger.info("Transfer completed successfully for transaction: {}", savedTransaction.getId());
            
            return convertToResponse(savedTransaction);
        } catch (Exception e) {
            // Mark transaction as failed
            transaction.setStatus(Transaction.TransactionStatus.FAILED);
            transaction.setProcessedAt(LocalDateTime.now());
            transactionRepository.save(transaction);
            
            logger.error("Transfer failed for user: {}, from: {}, to: {}", 
                        userId, request.getFromAccountId(), request.getToAccountId(), e);
            throw new RuntimeException("Transfer transaction failed: " + e.getMessage());
        }
    }
    
    private TransactionResponse convertToResponse(Transaction transaction) {
        return new TransactionResponse(
            transaction.getId(),
            transaction.getFromAccountId(),
            transaction.getToAccountId(),
            transaction.getAmount(),
            transaction.getType(),
            transaction.getDescription(),
            transaction.getStatus(),
            transaction.getCreatedAt(),
            transaction.getProcessedAt()
        );
    }
}