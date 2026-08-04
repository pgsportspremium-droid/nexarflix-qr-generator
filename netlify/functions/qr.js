import QRCode from 'qrcode';
import { cleanCode } from './_shared.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Método não permitido.' };
  }

  const text = String(event.queryStringParameters?.text || '').trim();
  const code = cleanCode(event.queryStringParameters?.code || 'QR') || 'QR';
  if (!/^https?:\/\//i.test(text)) {
    return { statusCode: 400, body: 'Link inválido.' };
  }

  try {
    const png = await QRCode.toBuffer(text, {
      type: 'png',
      width: 1200,
      margin: 4,
      errorCorrectionLevel: 'H',
      color: { dark: '#111111', light: '#ffffff' }
    });

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'content-type': 'image/png',
        'content-disposition': `inline; filename="QR-${code}.png"`,
        'cache-control': 'public, max-age=31536000, immutable'
      },
      body: png.toString('base64')
    };
  } catch (err) {
    console.error('qr error', err);
    return { statusCode: 500, body: 'Não foi possível gerar o QR.' };
  }
};
