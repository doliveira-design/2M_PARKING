import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { forkJoin } from 'rxjs';

import { AdminService } from '../services/admin.service';
import { TokenUtilService } from '../services/token-util.service';
import { NotifierService } from '../services/notifier.service';
import { PlateUtilService } from '../services/plate-util.service';
import { NgxSpinnerService } from 'ngx-spinner';

@Component({
    selector: 'app-admin-lists',
    templateUrl: '../templates/admin-lists.component.html',
    styleUrls: ['../../styles/components/admin-lists.component.scss']
})
export class AdminListsComponent implements OnInit, OnDestroy {

    whitelist: any[] = [];
    blacklist: any[] = [];
    private dataSub: Subscription;

    newWhitelist = { reg_no: '', description: '' };
    newBlacklist = { reg_no: '', description: '' };

    confirmDeleteWl: number | null = null;
    confirmDeleteBl: number | null = null;

    constructor(
        private admin: AdminService,
        private tokenUtil: TokenUtilService,
        private notifier: NotifierService,
        private plateUtil: PlateUtilService,
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
        this.dataSub = forkJoin([
            this.admin.getWhitelist(),
            this.admin.getBlacklist()
        ]).subscribe(
            ([wl, bl]) => {
                this.whitelist = wl;
                this.blacklist = bl;
                this.spinner.hide();
            },
            () => { this.spinner.hide(); }
        );
    }

    onPlateInput(event: any, target: string) {
        const formatted = this.plateUtil.applyMask(event.target.value);
        event.target.value = formatted;
        if (target === 'wl') { this.newWhitelist.reg_no = formatted; }
        else { this.newBlacklist.reg_no = formatted; }
    }

    addToWhitelist() {
        if (!this.newWhitelist.reg_no) {
            this.notifier.addMessage('error', 'Erro', 'Informe a placa.');
            return;
        }
        this.spinner.show();
        this.admin.addWhitelist(this.newWhitelist.reg_no, this.newWhitelist.description).subscribe(
            () => {
                this.notifier.addMessage('success', 'Sucesso', 'Placa adicionada à whitelist.');
                this.newWhitelist = { reg_no: '', description: '' };
                this.loadData();
            },
            () => { this.spinner.hide(); }
        );
    }

    addToBlacklist() {
        if (!this.newBlacklist.reg_no) {
            this.notifier.addMessage('error', 'Erro', 'Informe a placa.');
            return;
        }
        this.spinner.show();
        this.admin.addBlacklist(this.newBlacklist.reg_no, this.newBlacklist.description).subscribe(
            () => {
                this.notifier.addMessage('success', 'Sucesso', 'Placa adicionada à blacklist.');
                this.newBlacklist = { reg_no: '', description: '' };
                this.loadData();
            },
            () => { this.spinner.hide(); }
        );
    }

    removeWhitelist(id: number) {
        this.spinner.show();
        this.confirmDeleteWl = null;
        this.admin.removeWhitelist(id).subscribe(
            () => {
                this.notifier.addMessage('success', 'Sucesso', 'Removido da whitelist.');
                this.loadData();
            },
            () => { this.spinner.hide(); }
        );
    }

    removeBlacklist(id: number) {
        this.spinner.show();
        this.confirmDeleteBl = null;
        this.admin.removeBlacklist(id).subscribe(
            () => {
                this.notifier.addMessage('success', 'Sucesso', 'Removido da blacklist.');
                this.loadData();
            },
            () => { this.spinner.hide(); }
        );
    }

    formatPlate(plate: string): string {
        return this.plateUtil.formatPlate(plate);
    }

    logout() {
        this.tokenUtil.logout();
    }
}
