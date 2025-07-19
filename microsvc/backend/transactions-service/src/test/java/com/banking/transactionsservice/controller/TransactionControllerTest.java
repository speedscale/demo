package com.banking.transactionsservice.controller;

import com.banking.transactionsservice.dto.*;
import com.banking.transactionsservice.entity.Transaction;
import com.banking.transactionsservice.service.TransactionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.LongCounterBuilder;
import io.opentelemetry.api.metrics.Meter;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanBuilder;
import io.opentelemetry.api.trace.Tracer;
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
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
@WebMvcTest(value = TransactionController.class, excludeAutoConfiguration = {
    org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration.class,
    org.springframework.boot.autoconfigure.security.servlet.SecurityFilterAutoConfiguration.class
})
@ContextConfiguration(classes = {TransactionController.class, TransactionControllerTest.TestConfig.class})
class TransactionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TransactionService transactionService;

    @Autowired
    private ObjectMapper objectMapper;

    private TransactionResponse testTransactionResponse;
    private DepositRequest depositRequest;
    private WithdrawRequest withdrawRequest;
    private TransferRequest transferRequest;
    private Long testUserId = 1L;
    private Long testAccountId = 1L;
    private String testJwtToken = "Bearer test-token";

    @BeforeEach
    void setUp() {
        testTransactionResponse = new TransactionResponse();
        testTransactionResponse.setId(1L);
        testTransactionResponse.setUserId(testUserId);
        testTransactionResponse.setToAccountId(testAccountId);
        testTransactionResponse.setAmount(BigDecimal.valueOf(100.00));
        testTransactionResponse.setType(Transaction.TransactionType.DEPOSIT);
        testTransactionResponse.setDescription("Test deposit");
        testTransactionResponse.setStatus(Transaction.TransactionStatus.COMPLETED);
        testTransactionResponse.setCreatedAt(LocalDateTime.now());
        testTransactionResponse.setProcessedAt(LocalDateTime.now());

        depositRequest = new DepositRequest(testAccountId, BigDecimal.valueOf(100.00), "Test deposit");
        withdrawRequest = new WithdrawRequest(testAccountId, BigDecimal.valueOf(50.00), "Test withdrawal");
        transferRequest = new TransferRequest(testAccountId, 2L, BigDecimal.valueOf(75.00), "Test transfer");
    }

    private SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor jwtWithUserId() {
        return jwt().jwt(builder -> builder.claim("userId", testUserId));
    }

    @Test
    void getUserTransactions_Success() throws Exception {
        // Arrange
        List<TransactionResponse> transactions = Arrays.asList(testTransactionResponse);
        when(transactionService.getUserTransactions(testUserId)).thenReturn(transactions);

        // Act & Assert
        mockMvc.perform(get("/transactions").with(jwtWithUserId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1L))
                .andExpect(jsonPath("$[0].amount").value(100.00))
                .andExpect(jsonPath("$[0].type").value("DEPOSIT"))
                .andExpect(jsonPath("$[0].description").value("Test deposit"));

        verify(transactionService, times(1)).getUserTransactions(testUserId);
    }

    @Test
    void deposit_Success() throws Exception {
        // Arrange
        when(transactionService.deposit(any(DepositRequest.class), anyLong(), anyString()))
                .thenReturn(testTransactionResponse);

        // Act & Assert
        mockMvc.perform(post("/transactions/deposit").with(jwtWithUserId())
                .header("Authorization", testJwtToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(depositRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1L))
                .andExpect(jsonPath("$.amount").value(100.00))
                .andExpect(jsonPath("$.type").value("DEPOSIT"))
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        verify(transactionService, times(1)).deposit(any(DepositRequest.class), eq(testUserId), eq(testJwtToken));
    }

    @Test
    void deposit_InvalidInput() throws Exception {
        // Arrange
        depositRequest.setAmount(BigDecimal.valueOf(-10.00)); // Invalid negative amount

        // Act & Assert
        mockMvc.perform(post("/transactions/deposit").with(jwtWithUserId())
                .header("Authorization", testJwtToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(depositRequest)))
                .andExpect(status().isBadRequest());

        verify(transactionService, never()).deposit(any(DepositRequest.class), anyLong(), anyString());
    }

    @Test
    void deposit_AccountNotOwned() throws Exception {
        // Arrange
        when(transactionService.deposit(any(DepositRequest.class), anyLong(), anyString()))
                .thenThrow(new RuntimeException("Account not owned by user"));

        // Act & Assert
        mockMvc.perform(post("/transactions/deposit").with(jwtWithUserId())
                .header("Authorization", testJwtToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(depositRequest)))
                .andExpect(status().isBadRequest());

        verify(transactionService, times(1)).deposit(any(DepositRequest.class), eq(testUserId), eq(testJwtToken));
    }

    @Test
    void withdraw_Success() throws Exception {
        // Arrange
        TransactionResponse withdrawResponse = new TransactionResponse();
        withdrawResponse.setId(2L);
        withdrawResponse.setUserId(testUserId);
        withdrawResponse.setFromAccountId(testAccountId);
        withdrawResponse.setAmount(BigDecimal.valueOf(50.00));
        withdrawResponse.setType(Transaction.TransactionType.WITHDRAWAL);
        withdrawResponse.setDescription("Test withdrawal");
        withdrawResponse.setStatus(Transaction.TransactionStatus.COMPLETED);
        withdrawResponse.setCreatedAt(LocalDateTime.now());
        withdrawResponse.setProcessedAt(LocalDateTime.now());

        when(transactionService.withdraw(any(WithdrawRequest.class), anyLong(), anyString()))
                .thenReturn(withdrawResponse);

        // Act & Assert
        mockMvc.perform(post("/transactions/withdraw").with(jwtWithUserId())
                .header("Authorization", testJwtToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(withdrawRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(2L))
                .andExpect(jsonPath("$.amount").value(50.00))
                .andExpect(jsonPath("$.type").value("WITHDRAWAL"))
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        verify(transactionService, times(1)).withdraw(any(WithdrawRequest.class), eq(testUserId), eq(testJwtToken));
    }

    @Test
    void withdraw_InsufficientBalance() throws Exception {
        // Arrange
        when(transactionService.withdraw(any(WithdrawRequest.class), anyLong(), anyString()))
                .thenThrow(new RuntimeException("Insufficient balance"));

        // Act & Assert
        mockMvc.perform(post("/transactions/withdraw").with(jwtWithUserId())
                .header("Authorization", testJwtToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(withdrawRequest)))
                .andExpect(status().isBadRequest());

        verify(transactionService, times(1)).withdraw(any(WithdrawRequest.class), eq(testUserId), eq(testJwtToken));
    }

    @Test
    void transfer_Success() throws Exception {
        // Arrange
        TransactionResponse transferResponse = new TransactionResponse();
        transferResponse.setId(3L);
        transferResponse.setUserId(testUserId);
        transferResponse.setFromAccountId(testAccountId);
        transferResponse.setToAccountId(2L);
        transferResponse.setAmount(BigDecimal.valueOf(75.00));
        transferResponse.setType(Transaction.TransactionType.TRANSFER);
        transferResponse.setDescription("Test transfer");
        transferResponse.setStatus(Transaction.TransactionStatus.COMPLETED);
        transferResponse.setCreatedAt(LocalDateTime.now());
        transferResponse.setProcessedAt(LocalDateTime.now());

        when(transactionService.transfer(any(TransferRequest.class), anyLong(), anyString()))
                .thenReturn(transferResponse);

        // Act & Assert
        mockMvc.perform(post("/transactions/transfer").with(jwtWithUserId())
                .header("Authorization", testJwtToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(transferRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(3L))
                .andExpect(jsonPath("$.amount").value(75.00))
                .andExpect(jsonPath("$.type").value("TRANSFER"))
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        verify(transactionService, times(1)).transfer(any(TransferRequest.class), eq(testUserId), eq(testJwtToken));
    }

    @Test
    void transfer_SameAccount() throws Exception {
        // Arrange
        transferRequest.setToAccountId(testAccountId); // Same as fromAccountId

        // Act & Assert
        mockMvc.perform(post("/transactions/transfer").with(jwtWithUserId())
                .header("Authorization", testJwtToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(transferRequest)))
                .andExpect(status().isBadRequest());

        verify(transactionService, never()).transfer(any(TransferRequest.class), anyLong(), anyString());
    }

    @Test
    void transfer_InsufficientBalance() throws Exception {
        // Arrange
        when(transactionService.transfer(any(TransferRequest.class), anyLong(), anyString()))
                .thenThrow(new RuntimeException("Insufficient balance"));

        // Act & Assert
        mockMvc.perform(post("/transactions/transfer").with(jwtWithUserId())
                .header("Authorization", testJwtToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(transferRequest)))
                .andExpect(status().isBadRequest());

        verify(transactionService, times(1)).transfer(any(TransferRequest.class), eq(testUserId), eq(testJwtToken));
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
            lenient().when(mockSpan.setAttribute(anyString(), anyString())).thenReturn(mockSpan);
            lenient().when(mockSpan.setAttribute(anyString(), any(Long.class))).thenReturn(mockSpan);
            lenient().when(mockSpan.setAttribute(anyString(), any(Boolean.class))).thenReturn(mockSpan);
            
            return mockTracer;
        }
        
        @Bean
        @Primary
        public Meter meter() {
            Meter mockMeter = mock(Meter.class);
            LongCounterBuilder mockBuilder = mock(LongCounterBuilder.class);
            LongCounter mockCounter = mock(LongCounter.class);
            
            lenient().when(mockMeter.counterBuilder(anyString())).thenReturn(mockBuilder);
            lenient().when(mockBuilder.setDescription(anyString())).thenReturn(mockBuilder);
            lenient().when(mockBuilder.setUnit(anyString())).thenReturn(mockBuilder);
            lenient().when(mockBuilder.build()).thenReturn(mockCounter);
            
            return mockMeter;
        }
    }
}

