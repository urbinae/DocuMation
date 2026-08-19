let settingsCache = {
  companyName: 'Mi Empresa S.A.',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: process.env.SMTP_PORT || '587',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'no-reply@empresa.com',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleAllowedDomain: process.env.GOOGLE_ALLOWED_DOMAIN || ''
};

export const getSettings = async (req, res) => {
  try {
    return res.status(200).json(settingsCache);
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

export const saveSettings = async (req, res) => {
  try {
    const { companyName, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, googleClientId, googleAllowedDomain } = req.body;
    if (companyName !== undefined) settingsCache.companyName = companyName;
    if (smtpHost !== undefined) settingsCache.smtpHost = smtpHost;
    if (smtpPort !== undefined) settingsCache.smtpPort = smtpPort;
    if (smtpUser !== undefined) settingsCache.smtpUser = smtpUser;
    if (smtpPass !== undefined) settingsCache.smtpPass = smtpPass;
    if (smtpFrom !== undefined) settingsCache.smtpFrom = smtpFrom;
    if (googleClientId !== undefined) settingsCache.googleClientId = googleClientId;
    if (googleAllowedDomain !== undefined) settingsCache.googleAllowedDomain = googleAllowedDomain;

    return res.status(200).json({ message: 'Configuración guardada correctamente', settings: settingsCache });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};
