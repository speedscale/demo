package com.banking.transactionsservice.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.web.authentication.WebAuthenticationDetails;

public class UserAuthenticationDetails extends WebAuthenticationDetails {
    
    private final Long userId;
    
    public UserAuthenticationDetails(HttpServletRequest request, Long userId) {
        super(request);
        this.userId = userId;
    }
    
    public Long getUserId() {
        return userId;
    }
}