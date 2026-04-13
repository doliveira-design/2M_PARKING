import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { AdminService } from '../services/admin.service';
import { TokenUtilService } from '../services/token-util.service';
import { NotifierService } from '../services/notifier.service';
import { NgxSpinnerService } from 'ngx-spinner';

@Component({
    selector: 'app-admin-pricing',
    templateUrl: '../templates/admin-pricing.component.html',
    styleUrls: ['../../styles/components/admin-pricing.component.scss']
})
export class AdminPricingComponent implements OnInit, OnDestroy {

    pricing: any = null;
    editing = false;
    editData = { price_per_hour: 0, max_daily: 0, tolerance_minutes: 0 };
    private subs: Subscription[] = [];

    constructor(
        private admin: AdminService,
        private tokenUtil: TokenUtilService,
        private notifier: NotifierService,
        private router: Router,
        private spinner: NgxSpinnerService
    ) {}

    ngOnInit(): void {
        if (!this.tokenUtil.checkTokenExists('token_v')) {
            this.router.navigateByUrl('/valet/login');
            return;
        }
        this.loadPricing();
    }

    loadPricing() {
        this.spinner.show();
        this.subs.push(this.admin.getPricing().subscribe(
            (data) => {
                this.pricing = data && data.length > 0 ? data[0] : null;
                if (this.pricing) {
                    this.editData = {
                        price_per_hour: this.pricing.price_per_hour,
                        max_daily: this.pricing.max_daily,
                        tolerance_minutes: this.pricing.tolerance_minutes
                    };
                }
                this.spinner.hide();
            },
            () => { this.spinner.hide(); }
        ));
    }

    toggleEdit() {
        this.editing = !this.editing;
        if (this.pricing) {
            this.editData = {
                price_per_hour: this.pricing.price_per_hour,
                max_daily: this.pricing.max_daily,
                tolerance_minutes: this.pricing.tolerance_minutes
            };
        }
    }

    savePricing() {
        if (this.editData.price_per_hour <= 0 || this.editData.max_daily <= 0 || this.editData.tolerance_minutes < 0) {
            this.notifier.addMessage('error', 'Erro', 'Valores devem ser maiores que zero.');
            return;
        }

        this.spinner.show();
        this.subs.push(this.admin.updatePricing(this.pricing.id, this.editData).subscribe(
            () => {
                this.notifier.addMessage('success', 'Sucesso', 'Tarifação atualizada.');
                this.editing = false;
                this.loadPricing();
            },
            () => { this.spinner.hide(); }
        ));
    }

    logout() {
        this.tokenUtil.logout();
    }

    ngOnDestroy(): void {
        this.subs.forEach(s => s.unsubscribe());
    }
}
