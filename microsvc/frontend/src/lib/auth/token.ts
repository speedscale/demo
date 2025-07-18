import Cookies from 'js-cookie';

const TOKEN_KEY = process.env.NEXT_PUBLIC_JWT_COOKIE_NAME || 'auth_token';

export class TokenManager {
  private static tokenKey = TOKEN_KEY;

  // Set token in HttpOnly cookie (for security)
  static setToken(token: string): void {
    Cookies.set(this.tokenKey, token, {
      httpOnly: false, // Note: js-cookie can't set httpOnly cookies, but we'll handle this server-side
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: 1, // 1 day
    });
  }

  // Get token from cookie
  static getToken(): string | null {
    return Cookies.get(this.tokenKey) || null;
  }

  // Remove token from cookie
  static removeToken(): void {
    Cookies.remove(this.tokenKey);
  }

  // Check if token exists
  static hasToken(): boolean {
    return !!this.getToken();
  }

  // Decode JWT token payload (client-side only for user info)
  static decodeToken(token: string): Record<string, unknown> | null {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join(''),
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }

  // Check if token is expired
  static isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) return true;
      
      const currentTime = Date.now() / 1000;
      return (decoded.exp as number) < currentTime;
    } catch {
      return true;
    }
  }

  // Get user info from token
  static getUserFromToken(token: string): { id: number; username: string; roles: string } | null {
    try {
      const decoded = this.decodeToken(token);
      return decoded ? {
        id: decoded.userId as number,
        username: decoded.sub as string,
        roles: decoded.roles as string,
      } : null;
    } catch {
      return null;
    }
  }
}