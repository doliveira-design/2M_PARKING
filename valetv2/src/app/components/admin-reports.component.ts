import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { forkJoin } from 'rxjs';

import { AdminService } from '../services/admin.service';
import { TokenUtilService } from '../services/token-util.service';
import { NgxSpinnerService } from 'ngx-spinner';

@Component({
    selector: 'app-admin-reports',
    templateUrl: '../templates/admin-reports.component.html',
    styleUrls: ['../../styles/components/admin-reports.component.scss']
})
export class AdminReportsComponent implements OnInit, OnDestroy {

    filterFrom = '';
    filterTo = '';
    summary: any = null;
    daily: any[] = [];
    auditLogs: any[] = [];
    activeTab = 'summary';
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

        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        this.filterFrom = firstDay.toISOString().split('T')[0];
        this.filterTo = today.toISOString().split('T')[0];

        this.loadReports();
    }

    ngOnDestroy(): void {
        if (this.dataSub) { this.dataSub.unsubscribe(); }
    }

    loadReports() {
        this.spinner.show();
        this.dataSub = forkJoin([
            this.admin.getReportsSummary(this.filterFrom, this.filterTo),
            this.admin.getReportsDaily(this.filterFrom, this.filterTo),
            this.admin.getAuditLogs(100)
        ]).subscribe(
            ([s, d, a]) => {
                this.summary = s;
                this.daily = d;
                this.auditLogs = a;
                this.spinner.hide();
            },
            () => { this.spinner.hide(); }
        );
    }

    applyFilter() {
        this.loadReports();
    }

    setTab(tab: string) {
        this.activeTab = tab;
    }

    getActionLabel(action: string): string {
        const map: { [key: string]: string } = {
            'LOGIN_VALET': 'Login Valet',
            'LOGIN_VALET_FAIL': 'Login Falhou',
            'LOGIN_USER': 'Login Usuário',
            'LOGIN_USER_FAIL': 'Login Usuário Falhou',
            'TICKET_CREATE': 'Ticket Criado',
            'TICKET_BLOCKED_BLACKLIST': 'Bloqueado (Blacklist)',
            'PAYMENT': 'Pagamento',
            'EXIT': 'Saída',
            'WHITELIST_ADD': 'Whitelist +',
            'WHITELIST_REMOVE': 'Whitelist -',
            'BLACKLIST_ADD': 'Blacklist +',
            'BLACKLIST_REMOVE': 'Blacklist -',
            'VALET_CREATE': 'Valet Criado',
            'VALET_DELETE': 'Valet Removido',
            'VALET_SETUP': 'Valet Setup',
            'PRICING_UPDATE': 'Tarifação Alterada'
        };
        return map[action] || action;
    }

    getActionClass(action: string): string {
        if (action.includes('FAIL') || action.includes('BLACKLIST') || action.includes('BLOCKED')) { return 'action-red'; }
        if (action.includes('LOGIN') || action.includes('CREATE') || action.includes('SETUP')) { return 'action-blue'; }
        if (action.includes('PAYMENT')) { return 'action-green'; }
        if (action.includes('EXIT')) { return 'action-orange'; }
        return 'action-gray';
    }

    logout() {
        localStorage.removeItem('token_v');
        this.router.navigateByUrl('/valet/login');
    }
}
