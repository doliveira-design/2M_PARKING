import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';

import { catchError } from 'rxjs/operators';

import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TokenUtilService {

  url = null;

  constructor(private http: HttpClient, private router: Router) {
    this.url = environment.serverBaseUrl;
  }

  getAuthHeader(token) {
    return {
      headers: new HttpHeaders({
        'authorization': token
      })
    };
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
    const urlPath = path ? '/valet/verify' : '/user/verify';

    if (!tokenExists) {
      this.router.navigateByUrl('/', { skipLocationChange: false });
    }

    const token = this.getToken(tokenName);
    return this.http.get(`${this.url}${urlPath}`, this.getAuthHeader(token))
      .pipe(
        catchError((err) => {
          // TODO: navigate to unauthorized route instead
          this.router.navigateByUrl('/', { skipLocationChange: false });
          throw err;
        })
      );
  }
}
