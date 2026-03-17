import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PhoneUtilService {

  /**
   * Remove todos os caracteres não numéricos de um telefone.
   * Ex: "+55 (19) 99999-9999" => "5519999999999"
   */
  stripPhone(phone: string): string {
    return (phone || '').replace(/\D/g, '');
  }

  /**
   * Formata um número de telefone no padrão "+XX (XX) XXXXX-XXXX".
   * Aceita qualquer formato de entrada (colado, com traços, espaços, etc.)
   * Ex: "5519999999999" => "+55 (19) 99999-9999"
   *     "+55-19-999999999" => "+55 (19) 99999-9999"
   */
  formatPhone(phone: string): string {
    const digits = this.stripPhone(phone);

    if (digits.length < 12 || digits.length > 13) {
      return phone; // retorna sem formatar se não tiver tamanho esperado
    }

    const countryCode = digits.substring(0, 2);
    const areaCode = digits.substring(2, 4);
    const remaining = digits.substring(4);

    let firstPart: string;
    let secondPart: string;

    if (remaining.length === 9) {
      firstPart = remaining.substring(0, 5);
      secondPart = remaining.substring(5);
    } else {
      firstPart = remaining.substring(0, 4);
      secondPart = remaining.substring(4);
    }

    return `+${countryCode} (${areaCode}) ${firstPart}-${secondPart}`;
  }

  /**
   * Aplica a máscara de telefone em tempo real enquanto o usuário digita.
   * Ex: ao digitar "5519999999999" vai formatando progressivamente.
   */
  applyMask(value: string): string {
    const digits = this.stripPhone(value);

    if (digits.length === 0) return '';
    if (digits.length <= 2) return `+${digits}`;
    if (digits.length <= 4) return `+${digits.substring(0, 2)} (${digits.substring(2)}`;
    if (digits.length <= 5) return `+${digits.substring(0, 2)} (${digits.substring(2, 4)}) ${digits.substring(4)}`;

    const countryCode = digits.substring(0, 2);
    const areaCode = digits.substring(2, 4);
    const rest = digits.substring(4);

    if (rest.length <= 5) {
      return `+${countryCode} (${areaCode}) ${rest}`;
    }

    if (digits.length <= 12) {
      return `+${countryCode} (${areaCode}) ${rest.substring(0, 4)}-${rest.substring(4)}`;
    }

    return `+${countryCode} (${areaCode}) ${rest.substring(0, 5)}-${rest.substring(5, 9)}`;
  }

  /**
   * Valida se o telefone está no formato correto "+XX (XX) XXXXX-XXXX" ou "+XX (XX) XXXX-XXXX"
   */
  isValidPhone(phone: string): boolean {
    const digits = this.stripPhone(phone);
    return digits.length >= 12 && digits.length <= 13;
  }

  /**
   * Compara dois telefones ignorando formatação.
   * Ex: "+55 (19) 99999-9999" === "5519999999999" => true
   */
  phonesMatch(phone1: string, phone2: string): boolean {
    return this.stripPhone(phone1) === this.stripPhone(phone2);
  }
}
