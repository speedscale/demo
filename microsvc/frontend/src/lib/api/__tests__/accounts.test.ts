import { AccountsAPI } from '../accounts'
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

describe('AccountsAPI', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getAccounts', () => {
    it('should fetch all accounts for the current user', async () => {
      const mockResponse = {
        success: true,
        data: [
          { id: 1, accountNumber: '1234567890', accountType: 'CHECKING' as const, balance: 1000 },
          { id: 2, accountNumber: '1234567891', accountType: 'SAVINGS' as const, balance: 5000 },
        ],
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.getAccounts()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/accounts')
      expect(result).toEqual(mockResponse)
    })

    it('should handle errors when fetching accounts', async () => {
      const mockError = {
        success: false,
        message: 'Failed to fetch accounts',
        errors: ['Network error'],
      }
      mockApiClient.get.mockResolvedValue(mockError)

      const result = await AccountsAPI.getAccounts()

      expect(result).toEqual(mockError)
    })
  })

  describe('getAccountsPaginated', () => {
    it('should fetch paginated accounts with default parameters', async () => {
      const mockResponse = {
        success: true,
        data: {
          content: [{ id: 1, accountNumber: '1234567890', accountType: 'CHECKING' as const }],
          totalElements: 1,
          totalPages: 1,
        },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.getAccountsPaginated()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/accounts?page=0&size=10&sort=createdAt%2Cdesc')
      expect(result).toEqual(mockResponse)
    })

    it('should fetch paginated accounts with custom parameters', async () => {
      const mockResponse = { success: true, data: { content: [] } }
      mockApiClient.get.mockResolvedValue(mockResponse)

      await AccountsAPI.getAccountsPaginated(2, 5, 'balance,asc')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/accounts?page=2&size=5&sort=balance%2Casc')
    })
  })

  describe('getAccount', () => {
    it('should fetch a specific account by ID', async () => {
      const mockResponse = {
        success: true,
        data: { id: 1, accountNumber: '1234567890', accountType: 'CHECKING' as const, balance: 1000 },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.getAccount(1)

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/accounts/1')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('createAccount', () => {
    it('should create a new account', async () => {
      const accountData = {
        accountType: 'CHECKING' as const,
        initialBalance: 1000,
        currency: 'USD',
      }
      const mockResponse = {
        success: true,
        data: { id: 1, ...accountData, accountNumber: '1234567890' },
      }
      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.createAccount(accountData)

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/accounts', accountData)
      expect(result).toEqual(mockResponse)
    })

    it('should handle validation errors when creating account', async () => {
      const accountData = {
        accountType: 'CHECKING' as const,
        initialBalance: -100, // Invalid balance
      }
      const mockError = {
        success: false,
        message: 'Validation error',
        errors: ['Initial balance cannot be negative'],
      }
      mockApiClient.post.mockResolvedValue(mockError)

      const result = await AccountsAPI.createAccount(accountData)

      expect(result).toEqual(mockError)
    })
  })

  describe('updateAccount', () => {
    it('should update an existing account', async () => {
      const accountData = { accountType: 'SAVINGS' as const }
      const mockResponse = {
        success: true,
        data: { id: 1, accountNumber: '1234567890', accountType: 'SAVINGS' as const, balance: 1000 },
      }
      mockApiClient.put.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.updateAccount(1, accountData)

      expect(mockApiClient.put).toHaveBeenCalledWith('/api/accounts/1', accountData)
      expect(result).toEqual(mockResponse)
    })
  })

  describe('deleteAccount', () => {
    it('should delete an account', async () => {
      const mockResponse = { success: true }
      mockApiClient.delete.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.deleteAccount(1)

      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/accounts/1')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getAccountSummary', () => {
    it('should fetch account summary', async () => {
      const mockResponse = {
        success: true,
        data: {
          totalAccounts: 2,
          totalBalance: 6000,
          activeAccounts: 2,
          accountsByType: {
            CHECKING: 1,
            SAVINGS: 1,
            CREDIT: 0,
            INVESTMENT: 0,
          },
        },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.getAccountSummary()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/accounts/summary')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getAccountBalance', () => {
    it('should fetch account balance', async () => {
      const mockResponse = {
        success: true,
        data: { balance: 1000, currency: 'USD' },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.getAccountBalance(1)

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/accounts/1/balance')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('updateAccountStatus', () => {
    it('should update account status', async () => {
      const mockResponse = {
        success: true,
        data: { id: 1, accountNumber: '1234567890', status: 'FROZEN' as const },
      }
      mockApiClient.patch.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.updateAccountStatus(1, 'FROZEN')

      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/accounts/1/status', { status: 'FROZEN' })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('freezeAccount', () => {
    it('should freeze an account', async () => {
      const mockResponse = {
        success: true,
        data: { id: 1, accountNumber: '1234567890', status: 'FROZEN' as const },
      }
      mockApiClient.patch.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.freezeAccount(1)

      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/accounts/1/status', { status: 'FROZEN' })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('unfreezeAccount', () => {
    it('should unfreeze an account', async () => {
      const mockResponse = {
        success: true,
        data: { id: 1, accountNumber: '1234567890', status: 'ACTIVE' as const },
      }
      mockApiClient.patch.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.unfreezeAccount(1)

      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/accounts/1/status', { status: 'ACTIVE' })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('closeAccount', () => {
    it('should close an account', async () => {
      const mockResponse = {
        success: true,
        data: { id: 1, accountNumber: '1234567890', status: 'CLOSED' as const },
      }
      mockApiClient.patch.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.closeAccount(1)

      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/accounts/1/status', { status: 'CLOSED' })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getAccountsByType', () => {
    it('should fetch accounts by type', async () => {
      const mockResponse = {
        success: true,
        data: [{ id: 1, accountNumber: '1234567890', accountType: 'CHECKING' as const }],
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.getAccountsByType('CHECKING')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/accounts?type=CHECKING')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getAccountsByStatus', () => {
    it('should fetch accounts by status', async () => {
      const mockResponse = {
        success: true,
        data: [{ id: 1, accountNumber: '1234567890', status: 'ACTIVE' as const }],
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.getAccountsByStatus('ACTIVE')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/accounts?status=ACTIVE')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('searchAccounts', () => {
    it('should search accounts with default parameters', async () => {
      const mockResponse = {
        success: true,
        data: { content: [{ id: 1, accountNumber: '1234567890' }] },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await AccountsAPI.searchAccounts('checking')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/accounts/search?q=checking&page=0&size=10')
      expect(result).toEqual(mockResponse)
    })

    it('should search accounts with custom parameters', async () => {
      const mockResponse = { success: true, data: { content: [] } }
      mockApiClient.get.mockResolvedValue(mockResponse)

      await AccountsAPI.searchAccounts('savings', 1, 5)

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/accounts/search?q=savings&page=1&size=5')
    })
  })
})