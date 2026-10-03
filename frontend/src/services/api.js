import api from '../lib/api';

export async function loginUser(email, password) {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
}

export async function registerUser(name, email, password) {
  const response = await api.post('/auth/register', { name, email, password });
  return response.data;
}

export async function checkSession() {
  const response = await api.get('/auth/me');
  return response.data;
}

export async function logoutUser() {
  const response = await api.post('/auth/logout');
  return response.data;
}
