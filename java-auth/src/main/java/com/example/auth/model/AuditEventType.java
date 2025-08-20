package com.example.auth.model;

public enum AuditEventType {
    LOGIN_ATTEMPT,
    LOGIN_SUCCESS,
    LOGIN_FAILURE,
    TOKEN_VALIDATED,
    TOKEN_REFRESHED,
    TOKEN_REFRESH_FAILED,
    LOGOUT,
    ACCOUNT_LOCKED,
    PASSWORD_CHANGED
}