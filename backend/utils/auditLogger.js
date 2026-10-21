const db = require('../config/db');

/**
 * Get client IP address correctly from headers or connection
 */
function getClientIp(req) {
  if (!req) return null;
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || null;
}

/**
 * Sanitize sensitive fields (passwords, tokens, secrets) from audit details
 */
function sanitizeAuditDetails(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeAuditDetails);

  const SENSITIVE_KEYS = [
    'password', 'password_hash', 'token', 'token_hash', 'secret',
    'authorization', 'cookie', 'accesstoken', 'refreshtoken', 'newpassword', 'oldpassword'
  ];

  const sanitized = {};
  for (const [key, val] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (val && typeof val === 'object') {
      sanitized[key] = sanitizeAuditDetails(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

/**
 * Log an action to the audit_logs table
 * @param {Object} options
 * @param {number} options.userId - ID of the user performing the action
 * @param {string} options.action - Description of the action (e.g. 'CREATE_PROJECT')
 * @param {string} [options.entity] - Affected entity name (e.g. 'projects')
 * @param {number} [options.entityId] - ID of the affected entity
 * @param {number} [options.projectId] - ID of the project in scope (S-39: tra cứu theo dự án)
 * @param {Object} [options.details] - Additional details as JSON
 * @param {string} [options.ipAddress] - IP Address of the user
 */
async function logAudit({ userId, action, entity = null, entityId = null, projectId = null, details = null, ipAddress = null }) {
  try {
    const cleanDetails = details ? sanitizeAuditDetails(details) : null;
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, project_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, action, entity, entityId, projectId, cleanDetails, ipAddress]
    );
  } catch (error) {
    // We do not throw the error here so that audit logging failure doesn't break the main flow
    // In production, this should trigger an alert.
    console.error('Audit Log Error:', error);
  }
}

/**
 * Express Middleware to automatically log an action
 */
function createAuditMiddleware(actionName, entityName = null) {
  return function (req, res, next) {
    // Capture the original res.json and res.send
    const originalJson = res.json;
    
    // We override res.json to get the response data so we can log the entityId if it was created
    res.json = function (data) {
      res.json = originalJson; // Restore
      const responseBody = data;
      
      // Determine entityId if it exists in response (e.g., project.id)
      let entityId = null;
      if (responseBody && responseBody.project && responseBody.project.id) {
        entityId = responseBody.project.id;
      }
      
      const userId = req.session && req.session.user ? req.session.user.id : null;
      const ipAddress = getClientIp(req);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        logAudit({
          userId,
          action: actionName,
          entity: entityName,
          entityId,
          details: { requestBody: sanitizeAuditDetails(req.body) },
          ipAddress
        });
      }
      
      return res.json(data);
    };
    
    next();
  };
}

module.exports = {
  logAudit,
  createAuditMiddleware,
  getClientIp,
  sanitizeAuditDetails
};

