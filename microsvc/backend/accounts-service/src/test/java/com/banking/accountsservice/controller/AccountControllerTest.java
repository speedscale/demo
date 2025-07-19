package com.banking.accountsservice.controller;

import com.banking.accountsservice.dto.AccountCreateRequest;
import com.banking.accountsservice.dto.AccountResponse;
import com.banking.accountsservice.dto.BalanceResponse;
import com.banking.accountsservice.security.UserAuthenticationDetails;
import com.banking.accountsservice.service.AccountService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.LongCounterBuilder;
import io.opentelemetry.api.metrics.Meter;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanBuilder;
import io.opentelemetry.api.trace.Tracer;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
@WebMvcTest(value = AccountController.class, excludeAutoConfiguration = {
    org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration.class,
    org.springframework.boot.autoconfigure.security.servlet.SecurityFilterAutoConfiguration.class
})
@ContextConfiguration(classes = {AccountController.class, AccountControllerTest.TestConfig.class})
@WithMockUser(username="testuser")
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
    private final Long testUserId = 1L;
    private final Long testAccountId = 1L;

    @BeforeEach
    void setUp() {
        testAccountResponse = new AccountResponse(
                testAccountId,
                testUserId,
                "123456789012",
                BigDecimal.valueOf(1000.00),
                "CHECKING",
                LocalDateTime.now(),
                LocalDateTime.now()
        );

        testBalanceResponse = new BalanceResponse(
                testAccountId,
                "123456789012",
                BigDecimal.valueOf(1000.00)
        );

        createRequest = new AccountCreateRequest("SAVINGS");

        // Manually set up the SecurityContext
        HttpServletRequest mockRequest = mock(HttpServletRequest.class);
        UserAuthenticationDetails userDetails = new UserAuthenticationDetails(mockRequest, testUserId);
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                "testuser", null, Collections.emptyList());
        authentication.setDetails(userDetails);
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    @Test
    void getUserAccounts_Success() throws Exception {
        List<AccountResponse> accounts = Arrays.asList(testAccountResponse);
        when(accountService.getUserAccounts(testUserId)).thenReturn(accounts);

        mockMvc.perform(get("/account"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].accountNumber").value("123456789012"));

        verify(accountService).getUserAccounts(testUserId);
    }

    @Test
    void getAccountById_Success() throws Exception {
        when(accountService.getAccountById(testAccountId, testUserId)).thenReturn(testAccountResponse);

        mockMvc.perform(get("/account/{accountId}", testAccountId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountNumber").value("123456789012"));

        verify(accountService).getAccountById(testAccountId, testUserId);
    }

    @Test
    void getAccountById_NotFound() throws Exception {
        when(accountService.getAccountById(anyLong(), anyLong())).thenThrow(new RuntimeException("Account not found"));

        mockMvc.perform(get("/account/{accountId}", testAccountId))
                .andExpect(status().isNotFound());
    }

    @Test
    void getAccountBalance_Success() throws Exception {
        when(accountService.getAccountBalance(testAccountId, testUserId)).thenReturn(testBalanceResponse);

        mockMvc.perform(get("/account/{accountId}/balance", testAccountId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.balance").value(1000.00));
    }

    @Test
    void createAccount_Success() throws Exception {
        when(accountService.createAccount(any(AccountCreateRequest.class), eq(testUserId))).thenReturn(testAccountResponse);

        mockMvc.perform(post("/account")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accountNumber").value("123456789012"));
    }

    @Test
    void createAccount_InvalidInput() throws Exception {
        AccountCreateRequest invalidRequest = new AccountCreateRequest("");

        mockMvc.perform(post("/account")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invalidRequest)))
                .andExpect(status().isBadRequest());

        verify(accountService, never()).createAccount(any(), anyLong());
    }

    @Test
    void updateBalance_Success() throws Exception {
        when(accountService.updateBalance(eq(testAccountId), any(BigDecimal.class), eq(testUserId))).thenReturn(true);

        mockMvc.perform(put("/account/{accountId}/balance", testAccountId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"balance\": 1500.00}"))
                .andExpect(status().isOk());
    }

    @Test
    void updateBalance_Unauthorized() throws Exception {
        when(accountService.updateBalance(eq(testAccountId), any(BigDecimal.class), eq(testUserId)))
                .thenThrow(new RuntimeException("Account not found or access denied"));

        mockMvc.perform(put("/account/{accountId}/balance", testAccountId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"balance\": 1500.00}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void healthCheck_Success() throws Exception {
        mockMvc.perform(get("/account/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @TestConfiguration
    static class TestConfig {
        @Bean
        @Primary
        public Tracer tracer() {
            Tracer mockTracer = mock(Tracer.class);
            SpanBuilder mockSpanBuilder = mock(SpanBuilder.class);
            Span mockSpan = mock(Span.class);
            lenient().when(mockTracer.spanBuilder(anyString())).thenReturn(mockSpanBuilder);
            lenient().when(mockSpanBuilder.startSpan()).thenReturn(mockSpan);
            return mockTracer;
        }

        @Bean
        @Primary
        public Meter meter() {
            Meter mockMeter = mock(Meter.class);
            LongCounterBuilder mockBuilder = mock(LongCounterBuilder.class);
            LongCounter mockCounter = mock(LongCounter.class);
            lenient().when(mockMeter.counterBuilder(anyString())).thenReturn(mockBuilder);
            lenient().when(mockBuilder.build()).thenReturn(mockCounter);
            return mockMeter;
        }
    }
}