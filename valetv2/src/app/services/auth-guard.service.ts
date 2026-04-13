import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class ValetGuard implements CanActivate {

  constructor(private router: Router) {}

  canActivate(): boolean {
    const token = localStorage.getItem('token_v');
    if (!token) {
      this.router.navigateByUrl('/valet/login');
      return false;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('token_v');
        this.router.navigateByUrl('/valet/login');
        return false;
      }
      return true;
    } catch (e) {
      localStorage.removeItem('token_v');
      this.router.navigateByUrl('/valet/login');
      return false;
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {

  constructor(private router: Router) {}

  canActivate(): boolean {
    const token = localStorage.getItem('token_v');
    if (!token) {
      this.router.navigateByUrl('/valet/login');
      return false;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('token_v');
        this.router.navigateByUrl('/valet/login');
        return false;
      }
      if (payload.role !== 'admin') {
        this.router.navigateByUrl('/unauthorized');
        return false;
      }
      return true;
    } catch (e) {
      localStorage.removeItem('token_v');
      this.router.navigateByUrl('/valet/login');
      return false;
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class UserGuard implements CanActivate {

  constructor(private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const token = localStorage.getItem('token');
    if (!token) {
      const ticketNo = route.params.ticket_no || '';
      this.router.navigateByUrl(`/user/${ticketNo}/login`);
      return false;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('token');
        const ticketNo = route.params.ticket_no || '';
        this.router.navigateByUrl(`/user/${ticketNo}/login`);
        return false;
      }
      return true;
    } catch (e) {
      localStorage.removeItem('token');
      const ticketNo = route.params.ticket_no || '';
      this.router.navigateByUrl(`/user/${ticketNo}/login`);
      return false;
    }
  }
}
