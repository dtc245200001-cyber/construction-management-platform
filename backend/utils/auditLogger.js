const db = require('../config/db');

/**
 * Log an action to the audit_logs table
 * @param {Object} options
 * @param {number} options.userId - ID of the user performing the action
 * @param {string} options.action - Description of the action (e.g. 'CREATE_PROJECT')
 * @param {string} [options.entity] - Affected entity name (e.g. 'projects')
 * @param {number} [options.entityId] - ID of the affected entity
 * @param {Object} [options.details] - Additional details as JSON
 * @param {string} [options.ipAddress] - IP Address of the user
 */
async function logAudit({ userId, action, entity = null, entityId = null, details = null, ipAddress = null }) {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, entity, entityId, details, ipAddress]
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
      
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = req.session && req.session.user ? req.session.user.id : null;
        const ipAddress = req.ip || req.connection.remoteAddress;
        
        logAudit({
          userId,
          action: actionName,
          entity: entityName,
          entityId,
          details: { requestBody: req.body },
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
  createAuditMiddleware
};
