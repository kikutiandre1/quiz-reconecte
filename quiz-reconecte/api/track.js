// Vercel Serverless Function — Meta Conversions API (CAPI)
// Envia eventos do quiz ao Meta pelo lado do servidor,
// bypassando ad blockers e complementando o browser pixel.
// Requer env var: META_ACCESS_TOKEN (configurar no painel Vercel)
// Opcional:       META_TEST_EVENT_CODE (ex: TEST95628, remover em produção)

const PIXEL_ID = '511690350149140';

module.exports = async function handler(req, res) {
  // CORS — same origin, mas cobre qualquer redirecionamento
  res.setHeader('Access-Control-Allow-Origin', 'https://quiz-reconecte.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) {
    console.error('META_ACCESS_TOKEN não configurado');
    return res.status(500).json({ error: 'Token não configurado' });
  }

  const { event_name, event_id, event_source_url, custom_data } = req.body || {};
  if (!event_name) return res.status(400).json({ error: 'event_name é obrigatório' });

  // Dados do usuário para matching (IP + User-Agent — sem PII)
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || '';
  const userAgent = req.headers['user-agent'] || '';

  const eventPayload = {
    event_name,
    event_time: Math.floor(Date.now() / 1000),
    event_id: event_id || `${event_name}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    event_source_url: event_source_url || 'https://quiz-reconecte.vercel.app/',
    action_source: 'website',
    user_data: {
      client_ip_address: clientIp,
      client_user_agent: userAgent
    }
  };

  // Adiciona custom_data apenas se houver dados
  if (custom_data && typeof custom_data === 'object' && Object.keys(custom_data).length > 0) {
    eventPayload.custom_data = custom_data;
  }

  const payload = { data: [eventPayload] };

  // test_event_code ativa visibilidade no Eventos de Teste da Meta
  const testCode = process.env.META_TEST_EVENT_CODE;
  if (testCode) payload.test_event_code = testCode;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Meta CAPI erro:', JSON.stringify(data));
      return res.status(response.status).json(data);
    }

    return res.status(200).json({
      ok: true,
      events_received: data.events_received,
      fbtrace_id: data.fbtrace_id
    });
  } catch (error) {
    console.error('CAPI fetch error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};
