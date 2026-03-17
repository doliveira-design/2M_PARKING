import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PlateUtilService {

  /**
   * Remove todos os caracteres que não são letras ou dígitos.
   * Ex: "ABC-1234" => "ABC1234"
   */
  stripPlate(plate: string): string {
    return (plate || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  /**
   * Formata a placa para exibição.
   * Antiga: "ABC1234" => "ABC-1234"
   * Mercosul: "ABC1D23" => "ABC1D23"
   */
  formatPlate(plate: string): string {
    const clean = this.stripPlate(plate);
    if (clean.length !== 7) {
      return clean;
    }
    if (this.isOldFormat(clean)) {
      return clean.substring(0, 3) + '-' + clean.substring(3);
    }
    return clean;
  }

  /**
   * Aplica máscara em tempo real enquanto o usuário digita.
   * Limita a 7 caracteres alfanuméricos.
   * Se for formato antigo (3 letras + 4 dígitos), insere hífen automaticamente.
   */
  applyMask(value: string): string {
    const clean = this.stripPlate(value).substring(0, 7);
    if (clean.length <= 3) {
      return clean;
    }
    if (clean.length === 7 && this.isOldFormat(clean)) {
      return clean.substring(0, 3) + '-' + clean.substring(3);
    }
    if (clean.length > 3 && this.isPartialOldFormat(clean)) {
      return clean.substring(0, 3) + '-' + clean.substring(3);
    }
    return clean;
  }

  /**
   * Valida se a placa é válida (antiga ou Mercosul).
   * Antiga: ABC1234 (3 letras + 4 dígitos)
   * Mercosul: ABC1D23 (3 letras + 1 dígito + 1 letra + 2 dígitos)
   */
  isValidPlate(plate: string): boolean {
    const clean = this.stripPlate(plate);
    if (clean.length !== 7) {
      return false;
    }
    return this.isOldFormat(clean) || this.isMercosulFormat(clean);
  }

  /**
   * Verifica se é formato antigo: 3 letras + 4 dígitos
   */
  private isOldFormat(clean: string): boolean {
    return /^[A-Z]{3}[0-9]{4}$/.test(clean);
  }

  /**
   * Verifica se é formato Mercosul: 3 letras + 1 dígito + 1 letra + 2 dígitos
   */
  private isMercosulFormat(clean: string): boolean {
    return /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(clean);
  }

  /**
   * Verifica se os caracteres digitados até agora são compatíveis com formato antigo.
   * Usado para decidir se insere o hífen durante a digitação.
   */
  private isPartialOldFormat(clean: string): boolean {
    const letters = clean.substring(0, 3);
    const rest = clean.substring(3);
    return /^[A-Z]{3}$/.test(letters) && /^[0-9]+$/.test(rest);
  }
}
