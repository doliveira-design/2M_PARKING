import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { Subscription } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { TokenUtilService } from '../services/token-util.service';
import { NotifierService } from '../services/notifier.service';
import { NgxSpinnerService } from 'ngx-spinner';

import { AuthResponse } from '../interfaces/AuthResponse';

@Component({
    selector: 'app-user',
    templateUrl: '../templates/user-login.component.html',
    styleUrls: ['../../styles/components/user-login.component.scss']
})

export class UserLoginComponent implements OnInit, OnDestroy {

    userModel = {
        ticket_no: null,
        phone: null,
        reg_no: null
    };
    subscription: Subscription;
    focus = {
        phone: false,
        regNo: false
    };
    loginPressed = false;

    constructor(private auth: AuthService,
        private tokenUtil: TokenUtilService,
        private notifier: NotifierService,
        private route: ActivatedRoute,
        private router: Router,
        private spinner: NgxSpinnerService
    ) {
    }

    ngOnInit(): void {
        this.route.params.subscribe((param) => {
            this.userModel.ticket_no = param.ticket_no;
        });
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    login(form) {
        this.spinner.show();

        this.loginPressed = true;
        const status = form.status;
        // cleaning form value for car license plate no.
        form.value.reg_no = form.value.reg_no.replace('-', '').toUpperCase();

        if (status === 'valid'.toUpperCase()) {
            this.subscription =
                this.auth.loginUser(
                    this.userModel.ticket_no,
                    form.value.phone,
                    form.value.reg_no
                )
                .subscribe((response: AuthResponse) => {
                    if (response.auth) {
                        this.spinner.hide();
                        this.tokenUtil.setToken(response.token);
                        this.notifier.addMessage(
                            'success',
                            'Login Successful',
                            'Successfully logged in to valet ticket interface'
                        );
                        this.router.navigateByUrl(`user/${this.userModel.ticket_no}`,
                            { skipLocationChange: false });
                    }
                });
        }
    }

    onFocus(inputName) {
        this.focus[inputName] = true;
    }

    onBlur(inputName) {
        this.focus[inputName] = false;
    }
}
