const jwt = require('jsonwebtoken');

function verifyAdminToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(401).json({ 
      error: 'Accès refusé. En-tête d\'autorisation manquant.' 
    });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

  if (!token) {
    return res.status(401).json({ 
      error: 'Accès refusé. Jeton de sécurité introuvable.' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'jotna_jwt_super_secret_key_change_in_production');
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ 
      error: 'Jeton de sécurité invalide ou expiré. Veuillez vous re-connecter.' 
    });
  }
}

module.exports = {
  verifyAdminToken
};
