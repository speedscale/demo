import { apiClient, ApiResponse, PaginatedResponse } from './client';

export interface Account {
  id: number;
  userId: number;
  accountNumber: string;
  accountType: 'CHECKING' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT';
  balance: number;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE' | 'FROZEN' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountRequest {
  accountType: 'CHECKING' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT';
  initialBalance?: number;
  currency?: string;
}

export interface UpdateAccountRequest {
  accountType?: 'CHECKING' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT';
  status?: 'ACTIVE' | 'INACTIVE' | 'FROZEN' | 'CLOSED';
}

export interface AccountSummary {
  totalAccounts: number;
  totalBalance: number;
  activeAccounts: number;
  accountsByType: {
    [key in Account['accountType']]: number;
  };
}

export class AccountsAPI {
  // Get all accounts for the current user
  static async getAccounts(): Promise<ApiResponse<Account[]>> {
    return await apiClient.get<Account[]>('/api/accounts-service');
  }

  // Get paginated accounts
  static async getAccountsPaginated(
    page: number = 0,
    size: number = 10,
    sort: string = 'createdAt,desc'
  ): Promise<ApiResponse<PaginatedResponse<Account>>> {
    const params = new URLSearchParams({
      page: page.toString(),
      size: size.toString(),
      sort,
    });

    return await apiClient.get<PaginatedResponse<Account>>(`/api/accounts-service?${params}`);
  }

  // Get account by ID
  static async getAccount(accountId: number): Promise<ApiResponse<Account>> {
    return await apiClient.get<Account>(`/api/accounts-service/${accountId}`);
  }

  // Create new account
  static async createAccount(accountData: CreateAccountRequest): Promise<ApiResponse<Account>> {
    return await apiClient.post<Account>('/api/accounts-service', accountData);
  }

  // Update account
  static async updateAccount(
    accountId: number,
    accountData: UpdateAccountRequest
  ): Promise<ApiResponse<Account>> {
    return await apiClient.put<Account>(`/api/accounts-service/${accountId}`, accountData);
  }

  // Delete account
  static async deleteAccount(accountId: number): Promise<ApiResponse<void>> {
    return await apiClient.delete<void>(`/api/accounts-service/${accountId}`);
  }

  // Get account summary/statistics
  static async getAccountSummary(): Promise<ApiResponse<AccountSummary>> {
    return await apiClient.get<AccountSummary>('/api/accounts-service/summary');
  }

  // Get account balance
  static async getAccountBalance(accountId: number): Promise<ApiResponse<{ balance: number; currency: string }>> {
    return await apiClient.get<{ balance: number; currency: string }>(`/api/accounts-service/${accountId}/balance`);
  }

  // Update account status
  static async updateAccountStatus(
    accountId: number,
    status: Account['status']
  ): Promise<ApiResponse<Account>> {
    return await apiClient.patch<Account>(`/api/accounts-service/${accountId}/status`, { status });
  }

  // Freeze account
  static async freezeAccount(accountId: number): Promise<ApiResponse<Account>> {
    return await this.updateAccountStatus(accountId, 'FROZEN');
  }

  // Unfreeze account
  static async unfreezeAccount(accountId: number): Promise<ApiResponse<Account>> {
    return await this.updateAccountStatus(accountId, 'ACTIVE');
  }

  // Close account
  static async closeAccount(accountId: number): Promise<ApiResponse<Account>> {
    return await this.updateAccountStatus(accountId, 'CLOSED');
  }

  // Get accounts by type
  static async getAccountsByType(
    accountType: Account['accountType']
  ): Promise<ApiResponse<Account[]>> {
    return await apiClient.get<Account[]>(`/api/accounts-service?type=${accountType}`);
  }

  // Get accounts by status
  static async getAccountsByStatus(
    status: Account['status']
  ): Promise<ApiResponse<Account[]>> {
    return await apiClient.get<Account[]>(`/api/accounts-service?status=${status}`);
  }

  // Search accounts
  static async searchAccounts(
    query: string,
    page: number = 0,
    size: number = 10
  ): Promise<ApiResponse<PaginatedResponse<Account>>> {
    const params = new URLSearchParams({
      q: query,
      page: page.toString(),
      size: size.toString(),
    });

    return await apiClient.get<PaginatedResponse<Account>>(`/api/accounts-service/search?${params}`);
  }
}

