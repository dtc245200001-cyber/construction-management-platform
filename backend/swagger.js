const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'Hệ Thống API Quản Trị - Construction Management',
      version: '1.0.0',
      description: 'Core Backend API xử lý quản trị dự án, người dùng và xác thực bảo mật.',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local Development Server',
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'cmp.sid',
        },
      },
    },
    security: [{ cookieAuth: [] }],
  },
  apis: ['./routes/*.js'],
};

module.exports = swaggerJsdoc(options);
