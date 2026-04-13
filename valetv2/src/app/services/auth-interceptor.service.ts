import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';

import { TokenUtilService } from './token-util.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(private tokenUtil: TokenUtilService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Se o request já tem Authorization header (ex.: DataService passa token explícito), não sobrescrever
    if (req.headers.has('Authorization')) {
      return next.handle(req);
    }

    // Prioridade: token_v (admin/valet) > token (user)
    const token = this.tokenUtil.getToken('token_v') || this.tokenUtil.getToken('token');
    if (token) {
      const cloned = req.clone({
        setHeaders: { Authorization: token }
      });
      return next.handle(cloned);
    }

    return next.handle(req);
  }
}
