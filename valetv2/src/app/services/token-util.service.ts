import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TokenUtilService {

  constructor(private router: Router) {
  }

  setToken(token, name?: string) {
    const tokenName = name ? name : 'token';
    localStorage.setItem(tokenName, token);
  }

  getToken(name?: string) {
    const tokenName = name ? name : 'token';
    return localStorage.getItem(tokenName);
  }

  checkTokenExists(name?: string) {
    const tokenName = name ? name : 'token';
    const token = localStorage.getItem(tokenName);
    return ((token !== null) && (token !== undefined));
  }

  decodeToken(name?: string): any {
    const token = this.getToken(name);
    if (!token) { return null; }
    return this.decodeTokenString(token);
  }

  decodeTokenString(token: string): any {
    if (!token) { return null; }
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
      return null;
    }
  }

  isTokenExpired(name?: string): boolean {
    const payload = this.decodeToken(name);
    if (!payload || !payload.exp) { return true; }
    return payload.exp * 1000 < Date.now();
  }

  getRole(name?: string): string {
    const payload = this.decodeToken(name);
    return payload ? payload.role || '' : '';
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('token_v');
    this.router.navigateByUrl('/valet/login');
  }

  isTokenValid(path?: Boolean, tokenName?: string) {
    const tokenExists = this.checkTokenExists(tokenName);

    if (!tokenExists || this.isTokenExpired(tokenName)) {
      if (tokenExists) { localStorage.removeItem(tokenName || 'token'); }
      this.router.navigateByUrl('/', { skipLocationChange: false });
      return of(false);
    }

    return of(true);
  }
}
