import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';
import { TokenUtilService } from './token-util.service';

@Injectable({
  providedIn: 'root'
})
export class ValetGuard implements CanActivate {

  constructor(private router: Router, private tokenUtil: TokenUtilService) {}

  canActivate(): boolean {
    if (!this.tokenUtil.checkTokenExists('token_v')) {
      this.router.navigateByUrl('/valet/login');
      return false;
    }

    if (this.tokenUtil.isTokenExpired('token_v')) {
      localStorage.removeItem('token_v');
      this.router.navigateByUrl('/valet/login');
      return false;
    }

    return true;
  }
}

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {

  constructor(private router: Router, private tokenUtil: TokenUtilService) {}

  canActivate(): boolean {
    if (!this.tokenUtil.checkTokenExists('token_v')) {
      this.router.navigateByUrl('/valet/login');
      return false;
    }

    if (this.tokenUtil.isTokenExpired('token_v')) {
      localStorage.removeItem('token_v');
      this.router.navigateByUrl('/valet/login');
      return false;
    }

    if (this.tokenUtil.getRole('token_v') !== 'admin') {
      this.router.navigateByUrl('/unauthorized');
      return false;
    }

    return true;
  }
}

@Injectable({
  providedIn: 'root'
})
export class UserGuard implements CanActivate {

  constructor(private router: Router, private tokenUtil: TokenUtilService) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const ticketNo = route.params.ticket_no || '';

    if (!this.tokenUtil.checkTokenExists('token')) {
      this.router.navigateByUrl(`/user/${ticketNo}/login`);
      return false;
    }

    if (this.tokenUtil.isTokenExpired('token')) {
      localStorage.removeItem('token');
      this.router.navigateByUrl(`/user/${ticketNo}/login`);
      return false;
    }

    return true;
  }
}
