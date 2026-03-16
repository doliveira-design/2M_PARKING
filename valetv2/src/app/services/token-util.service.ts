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

  isTokenValid(path?: Boolean, tokenName?: string) {
    const tokenExists = this.checkTokenExists(tokenName);

    if (!tokenExists) {
      this.router.navigateByUrl('/', { skipLocationChange: false });
      return of(false);
    }

    return of(true);
  }
}
