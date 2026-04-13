import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { AdminService } from '../services/admin.service';
import { TokenUtilService } from '../services/token-util.service';
import { NotifierService } from '../services/notifier.service';
import { NgxSpinnerService } from 'ngx-spinner';

@Component({
    selector: 'app-admin-valets',
    templateUrl: '../templates/admin-valets.component.html',
    styleUrls: ['../../styles/components/admin-valets.component.scss']
})
export class AdminValetsComponent implements OnInit {

    valets: any[] = [];
    newValet = { uname: '', pwd: '', role: 'operador' };
    showForm = false;
    confirmDeleteId: number | null = null;

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
        this.loadValets();
    }

    loadValets() {
        this.spinner.show();
        this.admin.getValets().subscribe(
            (data) => { this.valets = data; this.spinner.hide(); },
            () => { this.spinner.hide(); }
        );
    }

    toggleForm() {
        this.showForm = !this.showForm;
        if (!this.showForm) {
            this.newValet = { uname: '', pwd: '', role: 'operador' };
        }
    }

    createValet() {
        if (!this.newValet.uname || !this.newValet.pwd) {
            this.notifier.addMessage('error', 'Erro', 'Preencha usuário e senha.');
            return;
        }

        this.spinner.show();
        this.admin.createValet(this.newValet.uname, this.newValet.pwd, this.newValet.role)
            .subscribe(
                () => {
                    this.notifier.addMessage('success', 'Sucesso', `Usuário '${this.newValet.uname}' criado.`);
                    this.newValet = { uname: '', pwd: '', role: 'operador' };
                    this.showForm = false;
                    this.loadValets();
                },
                () => { this.spinner.hide(); }
            );
    }

    confirmDelete(id: number) {
        this.confirmDeleteId = id;
    }

    cancelDelete() {
        this.confirmDeleteId = null;
    }

    deleteValet(id: number) {
        this.spinner.show();
        this.confirmDeleteId = null;
        this.admin.deleteValet(id).subscribe(
            () => {
                this.notifier.addMessage('success', 'Sucesso', 'Usuário removido.');
                this.loadValets();
            },
            () => { this.spinner.hide(); }
        );
    }

    getRoleBadgeClass(role: string): string {
        switch (role) {
            case 'admin': return 'badge-admin';
            case 'fiscal': return 'badge-fiscal';
            default: return 'badge-operador';
        }
    }

    logout() {
        localStorage.removeItem('token_v');
        this.router.navigateByUrl('/valet/login');
    }
}
