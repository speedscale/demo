package com.banking.accountsservice.controller;

import com.banking.accountsservice.dto.AccountCreateRequest;
import com.banking.accountsservice.dto.AccountResponse;
import com.banking.accountsservice.dto.BalanceResponse;
import com.banking.accountsservice.service.AccountService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
@WebMvcTest(AccountController.class)
class AccountControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AccountService accountService;

    @Autowired
    private ObjectMapper objectMapper;

    private AccountResponse testAccountResponse;
    private BalanceResponse testBalanceResponse;
    private AccountCreateRequest createRequest;
    private Long testUserId = 1L;
    private Long testAccountId = 1L;

    @BeforeEach
    void setUp() {
        testAccountResponse = new AccountResponse();
        testAccountResponse.setId(testAccountId);
        testAccountResponse.setUserId(testUserId);
        testAccountResponse.setAccountNumber("123456789012");
        testAccountResponse.setBalance(BigDecimal.valueOf(1000.00));
        testAccountResponse.setAccountType("CHECKING");
        testAccountResponse.setCreatedAt(LocalDateTime.now());
        testAccountResponse.setUpdatedAt(LocalDateTime.now());

        testBalanceResponse = new BalanceResponse();
        testBalanceResponse.setAccountId(testAccountId);
        testBalanceResponse.setAccountNumber("123456789012");
        testBalanceResponse.setBalance(BigDecimal.valueOf(1000.00));

        createRequest = new AccountCreateRequest("SAVINGS");
    }

    @Test
    void getUserAccounts_Success() throws Exception {
        // Arrange
        List<AccountResponse> accounts = Arrays.asList(testAccountResponse);
        when(accountService.getUserAccounts(testUserId)).thenReturn(accounts);

        // Act & Assert
        mockMvc.perform(get("/api/accounts")
                .header("X-User-ID", testUserId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].accountNumber").value("123456789012"))
                .andExpect(jsonPath("$[0].balance").value(1000.00))
                .andExpect(jsonPath("$[0].accountType").value("CHECKING"));

        verify(accountService, times(1)).getUserAccounts(testUserId);
    }

    @Test
    void getAccountById_Success() throws Exception {
        // Arrange
        when(accountService.getAccountById(testAccountId, testUserId)).thenReturn(testAccountResponse);

        // Act & Assert
        mockMvc.perform(get("/api/accounts/{accountId}", testAccountId)
                .header("X-User-ID", testUserId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountNumber").value("123456789012"))
                .andExpect(jsonPath("$.balance").value(1000.00))
                .andExpect(jsonPath("$.accountType").value("CHECKING"));

        verify(accountService, times(1)).getAccountById(testAccountId, testUserId);
    }

    @Test
    void getAccountById_NotFound() throws Exception {
        // Arrange
        when(accountService.getAccountById(testAccountId, testUserId))
                .thenThrow(new RuntimeException("Account not found"));

        // Act & Assert
        mockMvc.perform(get("/api/accounts/{accountId}", testAccountId)
                .header("X-User-ID", testUserId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Account not found"));

        verify(accountService, times(1)).getAccountById(testAccountId, testUserId);
    }

    @Test
    void getAccountBalance_Success() throws Exception {
        // Arrange
        when(accountService.getAccountBalance(testAccountId, testUserId)).thenReturn(testBalanceResponse);

        // Act & Assert
        mockMvc.perform(get("/api/accounts/{accountId}/balance", testAccountId)
                .header("X-User-ID", testUserId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(testAccountId))
                .andExpect(jsonPath("$.balance").value(1000.00))
                .andExpect(jsonPath("$.accountNumber").value("123456789012"));

        verify(accountService, times(1)).getAccountBalance(testAccountId, testUserId);
    }

    @Test
    void createAccount_Success() throws Exception {
        // Arrange
        when(accountService.createAccount(any(AccountCreateRequest.class), anyLong()))
                .thenReturn(testAccountResponse);

        // Act & Assert
        mockMvc.perform(post("/api/accounts")
                .header("X-User-ID", testUserId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accountNumber").value("123456789012"))
                .andExpect(jsonPath("$.balance").value(1000.00))
                .andExpect(jsonPath("$.accountType").value("CHECKING"));

        verify(accountService, times(1)).createAccount(any(AccountCreateRequest.class), eq(testUserId));
    }

    @Test
    void createAccount_InvalidInput() throws Exception {
        // Arrange
        createRequest.setAccountType(""); // Invalid account type

        // Act & Assert
        mockMvc.perform(post("/api/accounts")
                .header("X-User-ID", testUserId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isBadRequest());

        verify(accountService, never()).createAccount(any(AccountCreateRequest.class), anyLong());
    }

    @Test
    void validateAccountOwnership_Success() throws Exception {
        // Arrange
        when(accountService.validateAccountOwnership(testAccountId, testUserId)).thenReturn(true);

        // Act & Assert
        mockMvc.perform(get("/api/accounts/{accountId}/validate", testAccountId)
                .header("X-User-ID", testUserId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true));

        verify(accountService, times(1)).validateAccountOwnership(testAccountId, testUserId);
    }

    @Test
    void validateAccountOwnership_NotOwned() throws Exception {
        // Arrange
        when(accountService.validateAccountOwnership(testAccountId, testUserId)).thenReturn(false);

        // Act & Assert
        mockMvc.perform(get("/api/accounts/{accountId}/validate", testAccountId)
                .header("X-User-ID", testUserId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(false));

        verify(accountService, times(1)).validateAccountOwnership(testAccountId, testUserId);
    }

    @Test
    void updateBalance_Success() throws Exception {
        // Arrange
        when(accountService.updateBalance(testAccountId, BigDecimal.valueOf(1500.00), testUserId))
                .thenReturn(true);

        // Act & Assert
        mockMvc.perform(put("/api/accounts/{accountId}/balance", testAccountId)
                .header("X-User-ID", testUserId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"balance\": 1500.00}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        verify(accountService, times(1)).updateBalance(testAccountId, BigDecimal.valueOf(1500.00), testUserId);
    }

    @Test
    void updateBalance_Unauthorized() throws Exception {
        // Arrange
        when(accountService.updateBalance(testAccountId, BigDecimal.valueOf(1500.00), testUserId))
                .thenThrow(new RuntimeException("Account not owned by user"));

        // Act & Assert
        mockMvc.perform(put("/api/accounts/{accountId}/balance", testAccountId)
                .header("X-User-ID", testUserId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"balance\": 1500.00}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Account not owned by user"));

        verify(accountService, times(1)).updateBalance(testAccountId, BigDecimal.valueOf(1500.00), testUserId);
    }

    @Test
    void healthCheck_Success() throws Exception {
        // Act & Assert
        mockMvc.perform(get("/api/accounts/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.service").value("accounts-service"));
    }
}