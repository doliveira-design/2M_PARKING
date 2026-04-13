export const environment = {
  production: true,
  // Em produção: vazio = caminho relativo (IIS faz proxy reverso /api → backend)
  // Se backend separado, use o IP/hostname real. Ex: 'https://api.2mparking.com.br'
  apiUrl: '',
  mpPublicKey: ''
};
