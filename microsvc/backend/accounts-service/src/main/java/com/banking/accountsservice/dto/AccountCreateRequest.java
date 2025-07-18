package com.banking.accountsservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class AccountCreateRequest {
    
    @NotBlank(message = "Account type is required")
    @Pattern(regexp = "^(CHECKING|SAVINGS|CREDIT)$", message = "Account type must be CHECKING, SAVINGS, or CREDIT")
    private String accountType;
    
    public AccountCreateRequest() {}
    
    public AccountCreateRequest(String accountType) {
        this.accountType = accountType;
    }
    
    public String getAccountType() {
        return accountType;
    }
    
    public void setAccountType(String accountType) {
        this.accountType = accountType;
    }
}