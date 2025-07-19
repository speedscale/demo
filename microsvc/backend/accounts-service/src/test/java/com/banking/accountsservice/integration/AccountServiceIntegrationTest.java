package com.banking.accountsservice.integration;

import com.banking.accountsservice.dto.AccountCreateRequest;
import com.banking.accountsservice.dto.AccountResponse;
import com.banking.accountsservice.dto.BalanceResponse;
import com.banking.accountsservice.entity.Account;
import com.banking.accountsservice.repository.AccountRepository;
import com.banking.accountsservice.service.AccountService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(SpringExtension.class)
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AccountServiceIntegrationTest {

    @Autowired
    private AccountService accountService;

    @Autowired
    private AccountRepository accountRepository;

    private Long testUserId = 1L;
    private Long otherUserId = 2L;

    @BeforeEach
    void setUp() {
        // Clean up database before each test
        accountRepository.deleteAll();
    }

    @Test
    void testCreateAccount_Success() {
        // Create account
        AccountCreateRequest request = new AccountCreateRequest("CHECKING");
        AccountResponse response = accountService.createAccount(request, testUserId);

        assertNotNull(response);
        assertNotNull(response.getId());
        assertEquals(testUserId, response.getUserId());
        assertEquals("CHECKING", response.getAccountType());
        assertNotNull(response.getAccountNumber());
        assertEquals(BigDecimal.ZERO, response.getBalance());
        assertNotNull(response.getCreatedAt());
        assertNotNull(response.getUpdatedAt());

        // Verify account exists in database
        Account savedAccount = accountRepository.findById(response.getId()).orElse(null);
        assertNotNull(savedAccount);
        assertEquals(response.getAccountNumber(), savedAccount.getAccountNumber());
        assertEquals(response.getAccountType(), savedAccount.getAccountType());
    }

    @Test
    void testCreateMultipleAccounts_UniqueAccountNumbers() {
        // Create multiple accounts
        AccountCreateRequest request1 = new AccountCreateRequest("CHECKING");
        AccountCreateRequest request2 = new AccountCreateRequest("SAVINGS");
        
        AccountResponse response1 = accountService.createAccount(request1, testUserId);
        AccountResponse response2 = accountService.createAccount(request2, testUserId);

        assertNotNull(response1);
        assertNotNull(response2);
        assertNotEquals(response1.getAccountNumber(), response2.getAccountNumber());
        
        // Verify both accounts exist in database
        List<Account> userAccounts = accountRepository.findByUserId(testUserId);
        assertEquals(2, userAccounts.size());
    }

    @Test
    void testGetUserAccounts() {
        // Create accounts for test user
        AccountCreateRequest request1 = new AccountCreateRequest("CHECKING");
        AccountCreateRequest request2 = new AccountCreateRequest("SAVINGS");
        
        accountService.createAccount(request1, testUserId);
        accountService.createAccount(request2, testUserId);

        // Create account for other user
        AccountCreateRequest request3 = new AccountCreateRequest("CHECKING");
        accountService.createAccount(request3, otherUserId);

        // Get accounts for test user
        List<AccountResponse> userAccounts = accountService.getUserAccounts(testUserId);
        
        assertEquals(2, userAccounts.size());
        userAccounts.forEach(account -> assertEquals(testUserId, account.getUserId()));
        
        // Verify account types
        assertTrue(userAccounts.stream().anyMatch(acc -> "CHECKING".equals(acc.getAccountType())));
        assertTrue(userAccounts.stream().anyMatch(acc -> "SAVINGS".equals(acc.getAccountType())));
    }

    @Test
    void testGetAccountById_Success() {
        // Create account
        AccountCreateRequest request = new AccountCreateRequest("CHECKING");
        AccountResponse createdAccount = accountService.createAccount(request, testUserId);

        // Get account by ID
        AccountResponse retrievedAccount = accountService.getAccountById(createdAccount.getId(), testUserId);
        
        assertNotNull(retrievedAccount);
        assertEquals(createdAccount.getId(), retrievedAccount.getId());
        assertEquals(createdAccount.getAccountNumber(), retrievedAccount.getAccountNumber());
        assertEquals(createdAccount.getAccountType(), retrievedAccount.getAccountType());
        assertEquals(createdAccount.getBalance(), retrievedAccount.getBalance());
    }

    @Test
    void testGetAccountById_NotFound() {
        // Try to get account that doesn't exist
        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            accountService.getAccountById(999L, testUserId);
        });

        assertEquals("Account not found or access denied", exception.getMessage());
    }

    @Test
    void testGetAccountById_NotOwned() {
        // Create account for other user
        AccountCreateRequest request = new AccountCreateRequest("CHECKING");
        AccountResponse createdAccount = accountService.createAccount(request, otherUserId);

        // Try to get account with different user ID
        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            accountService.getAccountById(createdAccount.getId(), testUserId);
        });

        assertEquals("Account not found or access denied", exception.getMessage());
    }

    @Test
    void testGetAccountBalance() {
        // Create account
        AccountCreateRequest request = new AccountCreateRequest("CHECKING");
        AccountResponse createdAccount = accountService.createAccount(request, testUserId);

        // Get account balance
        BalanceResponse balanceResponse = accountService.getAccountBalance(createdAccount.getId(), testUserId);
        
        assertNotNull(balanceResponse);
        assertEquals(createdAccount.getId(), balanceResponse.getAccountId());
        assertEquals(createdAccount.getAccountNumber(), balanceResponse.getAccountNumber());
        assertEquals(BigDecimal.ZERO, balanceResponse.getBalance());
    }

    @Test
    void testValidateAccountOwnership_Success() {
        // Create account
        AccountCreateRequest request = new AccountCreateRequest("CHECKING");
        AccountResponse createdAccount = accountService.createAccount(request, testUserId);

        // Validate ownership
        boolean isOwned = accountService.validateAccountOwnership(createdAccount.getId(), testUserId);
        assertTrue(isOwned);
    }

    @Test
    void testValidateAccountOwnership_NotOwned() {
        // Create account for other user
        AccountCreateRequest request = new AccountCreateRequest("CHECKING");
        AccountResponse createdAccount = accountService.createAccount(request, otherUserId);

        // Validate ownership with different user
        boolean isOwned = accountService.validateAccountOwnership(createdAccount.getId(), testUserId);
        assertFalse(isOwned);
    }

    @Test
    void testValidateAccountOwnership_NotFound() {
        // Validate ownership of non-existent account
        boolean isOwned = accountService.validateAccountOwnership(999L, testUserId);
        assertFalse(isOwned);
    }

    @Test
    void testUpdateBalance_Success() {
        // Create account
        AccountCreateRequest request = new AccountCreateRequest("CHECKING");
        AccountResponse createdAccount = accountService.createAccount(request, testUserId);

        // Update balance
        BigDecimal newBalance = BigDecimal.valueOf(1000.00);
        boolean updateResult = accountService.updateBalance(createdAccount.getId(), newBalance, testUserId);
        
        assertTrue(updateResult);

        // Verify balance was updated
        BalanceResponse balanceResponse = accountService.getAccountBalance(createdAccount.getId(), testUserId);
        assertEquals(newBalance, balanceResponse.getBalance());
    }

    @Test
    void testUpdateBalance_NotOwned() {
        // Create account for other user
        AccountCreateRequest request = new AccountCreateRequest("CHECKING");
        AccountResponse createdAccount = accountService.createAccount(request, otherUserId);

        // Try to update balance with different user
        BigDecimal newBalance = BigDecimal.valueOf(1000.00);
        
        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            accountService.updateBalance(createdAccount.getId(), newBalance, testUserId);
        });

        assertEquals("Account not found or access denied", exception.getMessage());
    }

    @Test
    void testUpdateBalance_NotFound() {
        // Try to update balance of non-existent account
        BigDecimal newBalance = BigDecimal.valueOf(1000.00);
        
        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            accountService.updateBalance(999L, newBalance, testUserId);
        });

        assertEquals("Account not found or access denied", exception.getMessage());
    }

    @Test
    void testAccountTypes() {
        // Create accounts of different types
        String[] accountTypes = {"CHECKING", "SAVINGS", "CREDIT", "INVESTMENT"};
        
        for (String accountType : accountTypes) {
            AccountCreateRequest request = new AccountCreateRequest(accountType);
            AccountResponse response = accountService.createAccount(request, testUserId);
            
            assertNotNull(response);
            assertEquals(accountType, response.getAccountType());
        }
        
        // Verify all accounts were created
        List<AccountResponse> userAccounts = accountService.getUserAccounts(testUserId);
        assertEquals(4, userAccounts.size());
    }

    @Test
    void testAccountNumberUniqueness() {
        // Create many accounts to test uniqueness
        int numAccounts = 10;
        
        for (int i = 0; i < numAccounts; i++) {
            AccountCreateRequest request = new AccountCreateRequest("CHECKING");
            AccountResponse response = accountService.createAccount(request, testUserId);
            assertNotNull(response.getAccountNumber());
        }
        
        // Verify all account numbers are unique
        List<Account> allAccounts = accountRepository.findAll();
        assertEquals(numAccounts, allAccounts.size());
        
        long uniqueAccountNumbers = allAccounts.stream()
                .map(Account::getAccountNumber)
                .distinct()
                .count();
        
        assertEquals(numAccounts, uniqueAccountNumbers);
    }

    @Test
    void testConcurrentAccountCreation() {
        // This test verifies that account number generation is thread-safe
        // by creating multiple accounts concurrently
        int numThreads = 5;
        Thread[] threads = new Thread[numThreads];
        
        for (int i = 0; i < numThreads; i++) {
            final int threadId = i;
            threads[i] = new Thread(() -> {
                AccountCreateRequest request = new AccountCreateRequest("CHECKING");
                AccountResponse response = accountService.createAccount(request, testUserId + threadId);
                assertNotNull(response);
                assertNotNull(response.getAccountNumber());
            });
        }
        
        // Start all threads
        for (Thread thread : threads) {
            thread.start();
        }
        
        // Wait for all threads to complete
        for (Thread thread : threads) {
            try {
                thread.join();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        
        // Verify all accounts were created with unique account numbers
        List<Account> allAccounts = accountRepository.findAll();
        assertEquals(numThreads, allAccounts.size());
        
        long uniqueAccountNumbers = allAccounts.stream()
                .map(Account::getAccountNumber)
                .distinct()
                .count();
        
        assertEquals(numThreads, uniqueAccountNumbers);
    }
}