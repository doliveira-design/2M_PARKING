import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { TokenUtilService } from '../services/token-util.service';
import { NotifierService } from '../services/notifier.service';
import { NgxSpinnerService } from 'ngx-spinner';

import { AuthResponse } from '../interfaces/AuthResponse';

@Component({
    selector: 'app-valet-login',
    templateUrl: '../templates/valet-login.component.html',
    styleUrls: ['../../styles/components/valet-login.component.scss']
})

export class ValetLoginComponent implements OnInit, OnDestroy {

    valet = {
        uname: null,
        pwd: null
    };

    focus = {
        uname: false,
        pwd: false
    };

    loginPressed = false;
    submitting = false;

    constructor(private auth: AuthService,
        private tokenUtil: TokenUtilService,
        private notifier: NotifierService,
        private router: Router,
        private spinner: NgxSpinnerService) { }

    ngOnInit(): void {}
    ngOnDestroy(): void { }

    login(form) {
        if (this.submitting) { return; }
        this.spinner.show();

        this.loginPressed = true;
        this.submitting = true;
        const status = form.status;
        if (status === 'valid'.toUpperCase() ) {
            this.auth.loginValet(form.value.uname, form.value.pwd)
                .subscribe((response: AuthResponse) => {
                    if (response.auth) {
                        this.tokenUtil.setToken(response.token, 'token_v');
                        this.submitting = false;
                        this.spinner.hide();

                        // Decode JWT to check role
                        const payload = JSON.parse(atob(response.token.split('.')[1]));

                        if (payload.role === 'admin') {
                            this.notifier.addMessage(
                                'success',
                                'Login Realizado',
                                'Bem-vindo ao painel administrativo'
                            );
                            this.router.navigateByUrl('admin/dashboard',
                                { skipLocationChange: false });
                        } else {
                            this.notifier.addMessage(
                                'success',
                                'Login Realizado',
                                'Login realizado com sucesso no painel do manobrista'
                            );
                            this.router.navigateByUrl('valet/ticket',
                                { skipLocationChange: false });
                        }
                    }
                });
        } else {
            this.submitting = false;
            this.spinner.hide();
        }
    }

    onFocus(inputName) {
        this.focus[inputName] = true;
    }

    onBlur(inputName) {
        this.focus[inputName] = false;
    }

}
