import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

import { environment} from '../../environments/environment';
import { catchError } from 'rxjs/operators';

import { ErrorHandlerService } from './error-handler.service';

@Injectable({
  providedIn: 'root'
})
export class DataService {

  url = '';

  constructor(private http: HttpClient, private errHandler: ErrorHandlerService) {
    this.url = environment.serverBaseUrl;
  }

  getAuthHeader(token) {
    return {
      headers: new HttpHeaders({
        'authorization': token
      })
    };
  }

  getUser(ticketNo, token) {
    return this.http.get(
            `${this.url}/user?ticket=${ticketNo}`,
            this.getAuthHeader(token)
      )
      .pipe(
        catchError((errObj) => {
          this.errHandler.handleError(errObj);
          throw errObj;
        })
      );
  }

  updatePaymentStatus(ticketNo, token) {
    return this.http.patch(
            `${this.url}/user?ticket=${ticketNo}`,
            null,
            this.getAuthHeader(token)
      )
      .pipe(
        catchError((errObj) => {
          this.errHandler.handleError(errObj);
          throw errObj;
        })
      );
  }

  getQrCode(ticketNo, token) {
    return this.http.get(
            `${this.url}/qrcode?ticket=${ticketNo}`,
            this.getAuthHeader(token)
      )
      .pipe(
        catchError((errObj) => {
          this.errHandler.handleError(errObj);
          throw errObj;
        })
      );
  }

  createTicket(values, token) {
    return this.http.post(
            `${this.url}/ticket`,
            values,
            this.getAuthHeader(token)
      )
      .pipe(
        catchError((errObj) => {
          this.errHandler.handleError(errObj);
          throw errObj;
        })
      );
  }
}
