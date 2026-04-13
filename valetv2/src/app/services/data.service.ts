import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { ErrorHandlerService } from './error-handler.service';
import { PlateUtilService } from './plate-util.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DataService {

  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient, private errHandler: ErrorHandlerService, private plateUtil: PlateUtilService) {
  }

  private getHeaders(token?: string): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (token) {
      headers = headers.set('Authorization', token);
    }
    return headers;
  }

  getUser(ticketNo, token?) {
    return this.http.get<any>(`${this.apiUrl}/user`, {
      params: { ticket: ticketNo },
      headers: this.getHeaders(token)
    }).pipe(
      catchError(err => {
        const error = { status: err.status || 500 };
        this.errHandler.handleError(error);
        return throwError(error);
      })
    );
  }

  updatePaymentStatus(ticketNo, token?, paymentMethod?: string) {
    const body: any = {};
    if (paymentMethod) {
      body.payment_method = paymentMethod;
    }
    return this.http.patch<any>(`${this.apiUrl}/user`, body, {
      params: { ticket: ticketNo },
      headers: this.getHeaders(token)
    }).pipe(
      map(response => response),
      catchError(err => {
        const error = { status: err.status || 500 };
        this.errHandler.handleError(error);
        return throwError(error);
      })
    );
  }

  createTicket(values, token?) {
    return this.http.post<any>(`${this.apiUrl}/createTicket`, {
      first_name: values.first_name,
      last_name: values.last_name,
      phone_no: values.phone_no,
      reg_no: values.reg_no,
      manufacturer: values.manufacturer || '',
      model: values.model || '',
      color: values.color || ''
    }, {
      headers: this.getHeaders(token)
    }).pipe(
      catchError(err => {
        const error = { status: err.status || 500, message: err.error ? err.error.error : null };
        this.errHandler.handleError(error);
        return throwError(error);
      })
    );
  }

  searchByPlate(regNo: string, token?) {
    const plate = this.plateUtil.stripPlate(regNo);
    return this.http.get<any>(`${this.apiUrl}/plateCheck`, {
      params: { reg_no: plate },
      headers: this.getHeaders(token)
    }).pipe(
      catchError(err => {
        const error = { status: err.status || 500 };
        this.errHandler.handleError(error);
        return throwError(error);
      })
    );
  }

  exitVehicle(ticketNo: string, token?: string) {
    return this.http.post<any>(`${this.apiUrl}/exit`, {
      ticket_no: ticketNo
    }, {
      headers: this.getHeaders(token)
    }).pipe(
      catchError(err => {
        const error = { status: err.status || 500 };
        this.errHandler.handleError(error);
        return throwError(error);
      })
    );
  }

  generatePix(ticketNo: string) {
    return this.http.post<any>(`${this.apiUrl}/api/v1/pix/generate`, {
      ticket_no: ticketNo
    }, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      catchError(err => {
        const error = { status: err.status || 500, message: err.error ? err.error.error : 'Erro ao gerar PIX' };
        return throwError(error);
      })
    );
  }

  getPixStatus(gatewayId: string) {
    return this.http.get<any>(`${this.apiUrl}/api/v1/pix/status/${gatewayId}`).pipe(
      catchError(err => {
        const error = { status: err.status || 500 };
        return throwError(error);
      })
    );
  }

  authorizeCard(ticketNo: string, cardToken: string, installments?: number, payerEmail?: string) {
    const body: any = { ticket_no: ticketNo, card_token: cardToken };
    if (installments) { body.installments = installments; }
    if (payerEmail) { body.payer_email = payerEmail; }
    return this.http.post<any>(`${this.apiUrl}/api/v1/card/authorize`, body, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      catchError(err => {
        const error = { status: err.status || 500, message: err.error ? err.error.error : 'Erro no pagamento' };
        return throwError(error);
      })
    );
  }
}
