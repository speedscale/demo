package com.banking.transactionsservice.repository;

import com.banking.transactionsservice.entity.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TransactionRepository extends JpaRepository<Transaction, Long> {
    
    List<Transaction> findByUserIdOrderByCreatedAtDesc(Long userId);
    
    List<Transaction> findByFromAccountIdOrToAccountIdOrderByCreatedAtDesc(Long fromAccountId, Long toAccountId);
    
    @Query("SELECT t FROM Transaction t WHERE t.userId = :userId AND (t.fromAccountId = :accountId OR t.toAccountId = :accountId) ORDER BY t.createdAt DESC")
    List<Transaction> findByUserIdAndAccountIdOrderByCreatedAtDesc(@Param("userId") Long userId, @Param("accountId") Long accountId);
    
    Optional<Transaction> findByIdAndUserId(Long id, Long userId);
    
    @Query("SELECT t FROM Transaction t WHERE t.userId = :userId AND t.status = :status ORDER BY t.createdAt DESC")
    List<Transaction> findByUserIdAndStatus(@Param("userId") Long userId, @Param("status") Transaction.TransactionStatus status);
    
    @Query("SELECT t FROM Transaction t WHERE t.userId = :userId AND t.type = :type ORDER BY t.createdAt DESC")
    List<Transaction> findByUserIdAndType(@Param("userId") Long userId, @Param("type") Transaction.TransactionType type);
}