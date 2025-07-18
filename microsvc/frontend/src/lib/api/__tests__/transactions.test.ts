import { TransactionsAPI } from '../transactions'
import { apiClient } from '../client'

// Mock the API client
jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  },
}))

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>

describe('TransactionsAPI', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getTransactions', () => {
    it('should fetch all transactions for the current user', async () => {
      const mockResponse = {
        success: true,
        data: [
          { id: 1, accountId: 1, type: 'DEPOSIT' as const, amount: 1000, description: 'Initial deposit' },
          { id: 2, accountId: 1, type: 'WITHDRAWAL' as const, amount: 100, description: 'ATM withdrawal' },
        ],
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.getTransactions()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getTransactionsPaginated', () => {
    it('should fetch paginated transactions with default parameters', async () => {
      const mockResponse = {
        success: true,
        data: {
          content: [{ id: 1, accountId: 1, type: 'DEPOSIT' as const, amount: 1000 }],
          totalElements: 1,
          totalPages: 1,
        },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.getTransactionsPaginated()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions?page=0&size=10&sort=createdAt%2Cdesc')
      expect(result).toEqual(mockResponse)
    })

    it('should fetch paginated transactions with custom parameters', async () => {
      const mockResponse = { success: true, data: { content: [] } }
      mockApiClient.get.mockResolvedValue(mockResponse)

      await TransactionsAPI.getTransactionsPaginated(2, 5, 'amount,asc')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions?page=2&size=5&sort=amount%2Casc')
    })
  })

  describe('getFilteredTransactions', () => {
    it('should fetch filtered transactions', async () => {
      const filters = {
        accountId: 1,
        type: 'DEPOSIT' as const,
        status: 'COMPLETED' as const,
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        minAmount: 100,
        maxAmount: 1000,
        description: 'deposit',
      }
      const mockResponse = { success: true, data: { content: [] } }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.getFilteredTransactions(filters)

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/transactions?page=0&size=10&sort=createdAt%2Cdesc')
      )
      expect(result).toEqual(mockResponse)
    })

    it('should handle empty filters', async () => {
      const mockResponse = { success: true, data: { content: [] } }
      mockApiClient.get.mockResolvedValue(mockResponse)

      await TransactionsAPI.getFilteredTransactions({})

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions?page=0&size=10&sort=createdAt%2Cdesc')
    })
  })

  describe('getTransaction', () => {
    it('should fetch a specific transaction by ID', async () => {
      const mockResponse = {
        success: true,
        data: { id: 1, accountId: 1, type: 'DEPOSIT' as const, amount: 1000, description: 'Test deposit' },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.getTransaction(1)

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions/1')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getAccountTransactions', () => {
    it('should fetch transactions for a specific account', async () => {
      const mockResponse = {
        success: true,
        data: {
          content: [{ id: 1, accountId: 1, type: 'DEPOSIT' as const, amount: 1000 }],
        },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.getAccountTransactions(1)

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/accounts/1/transactions?page=0&size=10&sort=createdAt%2Cdesc')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('createTransaction', () => {
    it('should create a new transaction', async () => {
      const transactionData = {
        accountId: 1,
        type: 'DEPOSIT' as const,
        amount: 1000,
        currency: 'USD',
        description: 'Test deposit',
      }
      const mockResponse = {
        success: true,
        data: { id: 1, ...transactionData, status: 'COMPLETED' as const },
      }
      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.createTransaction(transactionData)

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/transactions', transactionData)
      expect(result).toEqual(mockResponse)
    })

    it('should handle validation errors when creating transaction', async () => {
      const transactionData = {
        accountId: 1,
        type: 'DEPOSIT' as const,
        amount: -100, // Invalid amount
        currency: 'USD',
        description: 'Test deposit',
      }
      const mockError = {
        success: false,
        message: 'Validation error',
        errors: ['Amount must be greater than 0'],
      }
      mockApiClient.post.mockResolvedValue(mockError)

      const result = await TransactionsAPI.createTransaction(transactionData)

      expect(result).toEqual(mockError)
    })
  })

  describe('createDeposit', () => {
    it('should create a deposit transaction', async () => {
      const mockResponse = {
        success: true,
        data: { id: 1, accountId: 1, type: 'DEPOSIT' as const, amount: 1000 },
      }
      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.createDeposit(1, 1000, 'Test deposit')

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/transactions', {
        accountId: 1,
        type: 'DEPOSIT',
        amount: 1000,
        currency: 'USD',
        description: 'Test deposit',
      })
      expect(result).toEqual(mockResponse)
    })

    it('should create a deposit transaction with custom currency', async () => {
      const mockResponse = { success: true, data: { id: 1 } }
      mockApiClient.post.mockResolvedValue(mockResponse)

      await TransactionsAPI.createDeposit(1, 1000, 'Test deposit', 'EUR')

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/transactions', {
        accountId: 1,
        type: 'DEPOSIT',
        amount: 1000,
        currency: 'EUR',
        description: 'Test deposit',
      })
    })
  })

  describe('createWithdrawal', () => {
    it('should create a withdrawal transaction', async () => {
      const mockResponse = {
        success: true,
        data: { id: 1, accountId: 1, type: 'WITHDRAWAL' as const, amount: 500 },
      }
      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.createWithdrawal(1, 500, 'Test withdrawal')

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/transactions', {
        accountId: 1,
        type: 'WITHDRAWAL',
        amount: 500,
        currency: 'USD',
        description: 'Test withdrawal',
      })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('createTransfer', () => {
    it('should create a transfer transaction', async () => {
      const mockResponse = {
        success: true,
        data: { id: 1, accountId: 1, toAccountId: 2, type: 'TRANSFER' as const, amount: 300 },
      }
      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.createTransfer(1, 2, 300, 'Test transfer')

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/transactions', {
        accountId: 1,
        toAccountId: 2,
        type: 'TRANSFER',
        amount: 300,
        currency: 'USD',
        description: 'Test transfer',
      })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('cancelTransaction', () => {
    it('should cancel a pending transaction', async () => {
      const mockResponse = {
        success: true,
        data: { id: 1, accountId: 1, status: 'CANCELLED' as const },
      }
      mockApiClient.patch.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.cancelTransaction(1)

      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/transactions/1/cancel')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getTransactionSummary', () => {
    it('should fetch transaction summary', async () => {
      const mockResponse = {
        success: true,
        data: {
          totalTransactions: 10,
          totalDeposits: 5,
          totalWithdrawals: 3,
          totalTransfers: 2,
          pendingTransactions: 1,
          completedTransactions: 9,
          failedTransactions: 0,
        },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.getTransactionSummary()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions/summary')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getAccountTransactionSummary', () => {
    it('should fetch transaction summary for a specific account', async () => {
      const mockResponse = {
        success: true,
        data: {
          totalTransactions: 5,
          totalDeposits: 3,
          totalWithdrawals: 2,
        },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.getAccountTransactionSummary(1)

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/accounts/1/transactions/summary')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getTransactionsByType', () => {
    it('should fetch transactions by type', async () => {
      const mockResponse = {
        success: true,
        data: { content: [{ id: 1, type: 'DEPOSIT' as const }] },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.getTransactionsByType('DEPOSIT')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions?type=DEPOSIT&page=0&size=10&sort=createdAt%2Cdesc')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getTransactionsByStatus', () => {
    it('should fetch transactions by status', async () => {
      const mockResponse = {
        success: true,
        data: { content: [{ id: 1, status: 'COMPLETED' as const }] },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.getTransactionsByStatus('COMPLETED')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions?status=COMPLETED&page=0&size=10&sort=createdAt%2Cdesc')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getPendingTransactions', () => {
    it('should fetch pending transactions', async () => {
      const mockResponse = {
        success: true,
        data: [{ id: 1, status: 'PENDING' as const }],
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.getPendingTransactions()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions?status=PENDING')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getRecentTransactions', () => {
    it('should fetch recent transactions with default limit', async () => {
      const mockResponse = {
        success: true,
        data: [{ id: 1, accountId: 1, type: 'DEPOSIT' as const }],
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.getRecentTransactions()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions/recent?limit=10')
      expect(result).toEqual(mockResponse)
    })

    it('should fetch recent transactions with custom limit', async () => {
      const mockResponse = { success: true, data: [] }
      mockApiClient.get.mockResolvedValue(mockResponse)

      await TransactionsAPI.getRecentTransactions(5)

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions/recent?limit=5')
    })
  })

  describe('searchTransactions', () => {
    it('should search transactions', async () => {
      const mockResponse = {
        success: true,
        data: { content: [{ id: 1, description: 'deposit' }] },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.searchTransactions('deposit')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions/search?q=deposit&page=0&size=10')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getTransactionsByDateRange', () => {
    it('should fetch transactions by date range', async () => {
      const mockResponse = {
        success: true,
        data: { content: [{ id: 1, createdAt: '2023-01-15' }] },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.getTransactionsByDateRange('2023-01-01', '2023-01-31')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions?startDate=2023-01-01&endDate=2023-01-31&page=0&size=10&sort=createdAt%2Cdesc')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getMonthlyTransactionReport', () => {
    it('should fetch monthly transaction report', async () => {
      const mockResponse = {
        success: true,
        data: {
          totalTransactions: 15,
          totalDeposits: 8,
          totalWithdrawals: 7,
        },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.getMonthlyTransactionReport(2023, 1)

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions/reports/monthly?year=2023&month=1')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('exportTransactions', () => {
    it('should export transactions in CSV format', async () => {
      const mockResponse = {
        success: true,
        data: { downloadUrl: 'https://example.com/export.csv' },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.exportTransactions('CSV')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/transactions/export?format=CSV')
      expect(result).toEqual(mockResponse)
    })

    it('should export transactions with filters', async () => {
      const filters = {
        accountId: 1,
        type: 'DEPOSIT' as const,
        startDate: '2023-01-01',
        endDate: '2023-12-31',
      }
      const mockResponse = {
        success: true,
        data: { downloadUrl: 'https://example.com/export.pdf' },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await TransactionsAPI.exportTransactions('PDF', filters)

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/transactions/export?format=PDF')
      )
      expect(result).toEqual(mockResponse)
    })
  })
})