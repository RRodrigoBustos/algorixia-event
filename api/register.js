// API - Registro de contactos en AlgorixIA CRM (GHL) + logging de actividad
// Vercel Serverless Function
// Env vars requeridas: GHL_API_KEY, GHL_LOCATION_ID

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

async function ghlFetch(path, method, body, apiKey) {
  const res = await fetch(`${GHL_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Version': GHL_VERSION
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    return res.status(500).json({ error: 'GHL credentials not configured' });
  }

  try {
    const { action, data } = req.body;

    // ==========================================
    // ACTION: register â Create/update contact
    // ==========================================
    if (action === 'register') {
      const { nombre, apellido, whatsapp, email, empresa, rol } = data;

      if (!nombre || !apellido || !email) {
        return res.status(400).json({ error: 'nombre, apellido, email required' });
      }

      // Upsert contact in GHL
      const contactBody = {
        firstName: nombre,
        lastName: apellido,
        email: email,
        phone: whatsapp || undefined,
        companyName: empresa || undefined,
        locationId: locationId,
        tags: [
          'evento-conectando-vm-2026',
          'app-interactiva',
          rol ? `rol-${rol.toLowerCase().replace(/[\s\/]/g, '-')}` : null
        ].filter(Boolean),
        source: '5Â° Encuentro Conectando Vaca Muerta',
        customFields: []
      };

      // Try upsert (create or update if exists)
      const upsertRes = await ghlFetch('/contacts/upsert', 'POST', contactBody, apiKey);

      if (!upsertRes.ok) {
        const errText = await upsertRes.text();
        console.error('GHL upsert error:', errText);
        // Try create as fallback
        const createRes = await ghlFetch('/contacts/', 'POST', contactBody, apiKey);
        if (!createRes.ok) {
          const createErr = await createRes.text();
          console.error('GHL create error:', createErr);
          return res.status(502).json({ error: 'Failed to create contact' });
        }
        const createData = await createRes.json();
        return res.status(200).json({ contactId: createData.contact?.id, status: 'created' });
      }

      const upsertData = await upsertRes.json();
      return res.status(200).json({
        contactId: upsertData.contact?.id,
        status: upsertData.new ? 'created' : 'updated'
      });
    }

    // ==========================================
    // ACTION: log â Log activity (add tags)
    // ==========================================
    if (action === 'log') {
      const { contactId, actividad, detalle, puntos } = data;

      if (!contactId) {
        return res.status(200).json({ status: 'skipped', reason: 'no contactId' });
      }

      // Add activity-specific tag
      const activityTag = `actividad-${actividad.toLowerCase().replace(/[\s+\/]/g, '-')}`;
      const tags = [activityTag];

      // Add score tag if applicable
      if (puntos && puntos > 0) {
        if (puntos >= 500) tags.push('score-alto');
        else if (puntos >= 300) tags.push('score-medio');
        else tags.push('score-bajo');
      }

      // Add completion tag
      if (detalle && detalle.includes('FinalizÃ³')) {
        tags.push('completÃ³-experiencia');
      }

      const tagRes = await ghlFetch(`/contacts/${contactId}/tags`, 'POST', { tags }, apiKey);

      if (!tagRes.ok) {
        console.error('GHL tag error:', await tagRes.text());
      }

      return res.status(200).json({ status: 'logged', tags });
    }

    return res.status(400).json({ error: 'Invalid action. Use: register, log' });

  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
