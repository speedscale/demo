package com.banking.accountsservice.service;

import com.banking.accountsservice.dto.AccountCreateRequest;
import com.banking.accountsservice.dto.AccountResponse;
import com.banking.accountsservice.dto.BalanceResponse;
import com.banking.accountsservice.entity.Account;
import com.banking.accountsservice.repository.AccountRepository;
import io.opentelemetry.api.metrics.LongCounter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private LongCounter createdAccountsCounter;

    @InjectMocks
    private AccountService accountService;

    private Account testAccount;
    private Long testUserId = 1L;
    private Long testAccountId = 1L;

    @BeforeEach
    void setUp() {
        testAccount = new Account();
        testAccount.setId(testAccountId);
        testAccount.setUserId(testUserId);
        testAccount.setAccountNumber("123456789012");
        testAccount.setBalance(BigDecimal.valueOf(1000.00));
        testAccount.setAccountType("CHECKING");
        testAccount.setCreatedAt(LocalDateTime.now());
        testAccount.setUpdatedAt(LocalDateTime.now());
    }

    @Test
    void testGetUserAccounts() {
        // Arrange
        List<Account> accounts = Arrays.asList(testAccount);
        when(accountRepository.findByUserId(testUserId)).thenReturn(accounts);

        // Act
        List<AccountResponse> result = accountService.getUserAccounts(testUserId);

        // Assert
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals(testAccount.getAccountNumber(), result.get(0).getAccountNumber());
        assertEquals(testAccount.getBalance(), result.get(0).getBalance());
        assertEquals(testAccount.getAccountType(), result.get(0).getAccountType());
        
        verify(accountRepository, times(1)).findByUserId(testUserId);
    }

    @Test
    void testGetAccountById() {
        // Arrange
        when(accountRepository.findByIdAndUserId(testAccountId, testUserId))
                .thenReturn(Optional.of(testAccount));

        // Act
        AccountResponse result = accountService.getAccountById(testAccountId, testUserId);

        // Assert
        assertNotNull(result);
        assertEquals(testAccount.getAccountNumber(), result.getAccountNumber());
        assertEquals(testAccount.getBalance(), result.getBalance());
        assertEquals(testAccount.getAccountType(), result.getAccountType());
        
        verify(accountRepository, times(1)).findByIdAndUserId(testAccountId, testUserId);
    }

    @Test
    void testGetAccountByIdNotFound() {
        // Arrange
        when(accountRepository.findByIdAndUserId(testAccountId, testUserId))
                .thenReturn(Optional.empty());

        // Act & Assert
        assertThrows(RuntimeException.class, () -> {
            accountService.getAccountById(testAccountId, testUserId);
        });
        
        verify(accountRepository, times(1)).findByIdAndUserId(testAccountId, testUserId);
    }

    @Test
    void testGetAccountBalance() {
        // Arrange
        when(accountRepository.findByIdAndUserId(testAccountId, testUserId))
                .thenReturn(Optional.of(testAccount));

        // Act
        BalanceResponse result = accountService.getAccountBalance(testAccountId, testUserId);

        // Assert
        assertNotNull(result);
        assertEquals(testAccountId, result.getAccountId());
        assertEquals(testAccount.getAccountNumber(), result.getAccountNumber());
        assertEquals(testAccount.getBalance(), result.getBalance());
        
        verify(accountRepository, times(1)).findByIdAndUserId(testAccountId, testUserId);
    }

    @Test
    void testCreateAccount() {
        // Arrange
        AccountCreateRequest request = new AccountCreateRequest("SAVINGS");
        when(accountRepository.existsByAccountNumber(anyString())).thenReturn(false);
        when(accountRepository.save(any(Account.class))).thenReturn(testAccount);

        // Act
        AccountResponse result = accountService.createAccount(request, testUserId);

        // Assert
        assertNotNull(result);
        assertEquals(testAccount.getAccountNumber(), result.getAccountNumber());
        assertEquals(testAccount.getBalance(), result.getBalance());
        assertEquals(testAccount.getAccountType(), result.getAccountType());
        
        verify(accountRepository, times(1)).save(any(Account.class));
        verify(accountRepository, atLeastOnce()).existsByAccountNumber(anyString());
    }

    @Test
    void testCreateAccountWithDuplicateAccountNumber() {
        // Arrange
        AccountCreateRequest request = new AccountCreateRequest("CHECKING");
        when(accountRepository.existsByAccountNumber(anyString()))
                .thenReturn(true)  // First call returns true (duplicate)
                .thenReturn(false); // Second call returns false (unique)
        when(accountRepository.save(any(Account.class))).thenReturn(testAccount);

        // Act
        AccountResponse result = accountService.createAccount(request, testUserId);

        // Assert
        assertNotNull(result);
        verify(accountRepository, times(1)).save(any(Account.class));
        verify(accountRepository, times(2)).existsByAccountNumber(anyString());
    }
}