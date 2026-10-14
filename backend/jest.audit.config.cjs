// These suites mock config/db. Never load dotenv or the migration globalSetup.
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/__tests__/acceptanceReview.test.js',
    '<rootDir>/__tests__/acceptanceLifecycle.test.js',
    '<rootDir>/__tests__/acceptanceFlow.test.js',
    '<rootDir>/__tests__/diaryAudit.test.js',
  ],
};
