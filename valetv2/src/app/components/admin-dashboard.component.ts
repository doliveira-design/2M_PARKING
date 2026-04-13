import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { forkJoin } from 'rxjs';

import { AdminService } from '../services/admin.service';
import { TokenUtilService } from '../services/token-util.service';
import { NgxSpinnerService } from 'ngx-spinner';

@Component({
    selector: 'app-admin-dashboard',
    templateUrl: '../templates/admin-dashboard.component.html',
    styleUrls: ['../../styles/components/admin-dashboard.component.scss']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {

    occupancy: any = null;
    summary: any = null;
    loading = true;
    private dataSub: Subscription;

    constructor(
        private admin: AdminService,
        private tokenUtil: TokenUtilService,
        private router: Router,
        private spinner: NgxSpinnerService
    ) {}

    ngOnInit(): void {
        if (!this.tokenUtil.checkTokenExists('token_v')) {
            this.router.navigateByUrl('/valet/login');
            return;
        }
        this.loadData();
    }

    ngOnDestroy(): void {
        if (this.dataSub) { this.dataSub.unsubscribe(); }
    }

    loadData() {
        this.spinner.show();
        const today = new Date().toISOString().split('T')[0];

        this.dataSub = forkJoin([
            this.admin.getOccupancy(),
            this.admin.getReportsSummary(today, today)
        ]).subscribe(
            ([occData, summaryData]) => {
                this.occupancy = occData && occData.length > 0 ? occData[0] : null;
                this.summary = summaryData;
                this.loading = false;
                this.spinner.hide();
            },
            () => { this.loading = false; this.spinner.hide(); }
        );
    }

    logout() {
        this.tokenUtil.logout();
    }
}
