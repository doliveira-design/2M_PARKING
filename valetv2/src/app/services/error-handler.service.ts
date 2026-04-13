import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { NotifierService } from './notifier.service';
import { NgxSpinnerService } from 'ngx-spinner';

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlerService {

  statusCode = {
    400: 'badRequest',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'notFound',
    500: 'internalServer'
  };

  errorMessages = {
    400: 'Os dados fornecidos resultaram em uma requisição inválida. Tente novamente com dados válidos.',
    401: 'Você não está autorizado a acessar esta página. Faça login para continuar.',
    403: 'Veículo bloqueado. Entrada não permitida.',
    404: `O recurso solicitado não existe no servidor.
          Verifique os dados informados e tente novamente ou entre em contato com o suporte técnico.`,
    500: 'Houve um problema ao processar sua solicitação. Tente novamente.'
  };

  constructor(private notifier: NotifierService,
    private router: Router,
    private spinner: NgxSpinnerService) { }

  handleError(err) {
    this.spinner.hide();
    const code: number = err.status || 500;
    const msg = err.message || this.errorMessages[code] || this.errorMessages[500];
    this.notifier.addMessage('error', 'Erro', msg);
    switch (code) {
      case 401:
        this.router.navigateByUrl(`/unauthorized`,
          { skipLocationChange: false });
        break;
      case 404:
        this.router.navigateByUrl(`/`,
          { skipLocationChange: false });
        break;
      default:
    }
  }

  authError(err) {
    this.spinner.hide();
    const code: number = err.status || 500;
    let errMsg = this.errorMessages[code];

    if (code === 401 || code === 404) {
      errMsg = 'Usuário e/ou senha incorretos. Tente novamente.';
    }

    this.notifier.addMessage('error', 'Erro', errMsg);
  }
}

