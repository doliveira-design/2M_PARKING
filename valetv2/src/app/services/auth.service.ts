import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { ErrorHandlerService } from '../services/error-handler.service';
import { Md5 } from 'ts-md5/dist/md5';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient, private errHandler: ErrorHandlerService) {
  }

  loginUser(ticket_no, phone, reg_no) {
    return this.http.post<any>(`${this.apiUrl}/authorizeUser`, {
      ticket_no,
      phone,
      reg_no
    }).pipe(
      map(response => {
        return { auth: response.auth, token: response.token };
      }),
      catchError(err => {
        const error = { status: err.status || 500 };
        this.errHandler.authError(error);
        return throwError(error);
      })
    );
  }

  loginValet(uname, pwd) {
    return this.http.post<any>(`${this.apiUrl}/authorizeValet`, {
      uname,
      pwd
    }).pipe(
      map(response => {
        return { auth: response.auth, token: response.token };
      }),
      catchError(err => {
        const error = { status: err.status || 500 };
        this.errHandler.authError(error);
        return throwError(error);
      })
    );
  }

}
