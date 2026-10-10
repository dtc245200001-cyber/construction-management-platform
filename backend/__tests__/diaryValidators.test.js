const { validateCreateDiaryEntry, validateGetDiaryEntries } = require('../utils/diaryValidators');

describe('Diary Validators', () => {
  describe('validateCreateDiaryEntry', () => {
    it('should return errors for invalid work_item_id', () => {
      expect(validateCreateDiaryEntry({})).toContain('work_item_id must be a positive integer');
      expect(validateCreateDiaryEntry({ work_item_id: -1 })).toContain('work_item_id must be a positive integer');
      expect(validateCreateDiaryEntry({ work_item_id: '123' })).toContain('work_item_id must be a positive integer');
    });

    it('should return errors for invalid content', () => {
      expect(validateCreateDiaryEntry({ work_item_id: 1 })).toContain('content is required and must be a string');
      expect(validateCreateDiaryEntry({ work_item_id: 1, content: '   ' })).toContain('content must be between 1 and 5000 characters');
      const longStr = 'a'.repeat(5001);
      expect(validateCreateDiaryEntry({ work_item_id: 1, content: longStr })).toContain('content must be between 1 and 5000 characters');
    });

    it('should return error for invalid entry_at', () => {
      expect(validateCreateDiaryEntry({ work_item_id: 1, content: 'test', entry_at: 'invalid-date' })).toContain('entry_at must be a valid ISO 8601 date');
      
      const future = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      expect(validateCreateDiaryEntry({ work_item_id: 1, content: 'test', entry_at: future })).toContain('entry_at cannot be more than 10 minutes in the future');
    });

    it('should return error for invalid client_id', () => {
      expect(validateCreateDiaryEntry({ work_item_id: 1, content: 'test', client_id: 'not-uuid' })).toContain('client_id must be a valid UUID');
    });

    it('should return empty array for valid input', () => {
      const valid = validateCreateDiaryEntry({
        work_item_id: 1,
        content: 'Valid content',
        entry_at: new Date().toISOString(),
        client_id: '123e4567-e89b-12d3-a456-426614174000'
      });
      expect(valid).toHaveLength(0);
    });
  });

  describe('validateGetDiaryEntries', () => {
    it('should handle limit and offset correctly', () => {
      let res = validateGetDiaryEntries({});
      expect(res.errors).toHaveLength(0);
      expect(res.params).toEqual({ limit: 50, offset: 0 });

      res = validateGetDiaryEntries({ limit: '10', offset: '20' });
      expect(res.errors).toHaveLength(0);
      expect(res.params).toEqual({ limit: 10, offset: 20 });

      res = validateGetDiaryEntries({ limit: '250', offset: '-5' });
      expect(res.errors).toContain('limit must be between 1 and 200');
      expect(res.errors).toContain('offset must be non-negative integer');
    });

    it('should validate dates correctly', () => {
      let res = validateGetDiaryEntries({ date: '2026-02-30' });
      expect(res.errors).toContain('date must be a valid YYYY-MM-DD date');

      res = validateGetDiaryEntries({ date: '2026-10-01', from: '2026-10-01' });
      expect(res.errors).toContain('cannot use date together with from/to');

      res = validateGetDiaryEntries({ from: '2026-10-10', to: '2026-10-05' });
      expect(res.errors).toContain('from must be less than or equal to to');
    });

    it('should validate work_item_id', () => {
      let res = validateGetDiaryEntries({ work_item_id: '-1' });
      expect(res.errors).toContain('work_item_id must be a positive integer');
    });
  });
});
