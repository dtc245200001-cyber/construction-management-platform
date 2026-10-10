const isUuid = (str) => {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(str);
};

const isValidDate = (dateString) => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const parts = dateString.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (month === 0 || month > 12) return false;
  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year % 400 === 0 || (year % 100 !== 0 && year % 4 === 0)) monthLengths[1] = 29;
  return day > 0 && day <= monthLengths[month - 1];
};

exports.validateCreateDiaryEntry = (body) => {
  const errors = [];
  
  if (!Number.isInteger(body.work_item_id) || body.work_item_id <= 0) {
    errors.push('work_item_id must be a positive integer');
  }

  if (typeof body.content !== 'string') {
    errors.push('content is required and must be a string');
  } else {
    const trimmed = body.content.trim();
    if (trimmed.length < 1 || trimmed.length > 5000) {
      errors.push('content must be between 1 and 5000 characters');
    }
  }

  if (body.entry_at !== undefined) {
    const time = new Date(body.entry_at).getTime();
    if (isNaN(time)) {
      errors.push('entry_at must be a valid ISO 8601 date');
    } else {
      const now = Date.now();
      if (time > now + 10 * 60 * 1000) {
        errors.push('entry_at cannot be more than 10 minutes in the future');
      }
    }
  }

  if (body.client_id !== undefined) {
    if (!isUuid(body.client_id)) {
      errors.push('client_id must be a valid UUID');
    }
  }

  return errors;
};

exports.validateGetDiaryEntries = (query) => {
  const errors = [];

  let limit = 50;
  if (query.limit !== undefined) {
    limit = parseInt(query.limit, 10);
    if (isNaN(limit) || limit < 1 || limit > 200) {
      errors.push('limit must be between 1 and 200');
    }
  }

  let offset = 0;
  if (query.offset !== undefined) {
    offset = parseInt(query.offset, 10);
    if (isNaN(offset) || offset < 0) {
      errors.push('offset must be non-negative integer');
    }
  }

  if (query.date !== undefined) {
    if (!isValidDate(query.date)) {
      errors.push('date must be a valid YYYY-MM-DD date');
    }
    if (query.from || query.to) {
      errors.push('cannot use date together with from/to');
    }
  }

  if (query.from !== undefined || query.to !== undefined) {
    if (query.from && !isValidDate(query.from)) {
      errors.push('from must be a valid YYYY-MM-DD date');
    }
    if (query.to && !isValidDate(query.to)) {
      errors.push('to must be a valid YYYY-MM-DD date');
    }
    if (query.from && query.to && isValidDate(query.from) && isValidDate(query.to)) {
      if (query.from > query.to) {
        errors.push('from must be less than or equal to to');
      }
    }
  }

  if (query.work_item_id !== undefined) {
    const workItemId = parseInt(query.work_item_id, 10);
    if (isNaN(workItemId) || workItemId <= 0) {
      errors.push('work_item_id must be a positive integer');
    }
  }

  return { errors, params: { limit, offset } };
};
