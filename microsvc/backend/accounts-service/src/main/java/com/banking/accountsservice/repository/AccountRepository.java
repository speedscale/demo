package com.banking.accountsservice.repository;

import com.banking.accountsservice.entity.Account;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AccountRepository extends JpaRepository<Account, Long> {
    
    List<Account> findByUserId(Long userId);
    
    Optional<Account> findByAccountNumber(String accountNumber);
    
    Optional<Account> findByIdAndUserId(Long id, Long userId);
    
    @Query("SELECT a FROM Account a WHERE a.userId = :userId AND a.id = :accountId")
    Optional<Account> findByUserIdAndAccountId(@Param("userId") Long userId, @Param("accountId") Long accountId);
    
    boolean existsByAccountNumber(String accountNumber);
    
    boolean existsByIdAndUserId(Long id, Long userId);
}