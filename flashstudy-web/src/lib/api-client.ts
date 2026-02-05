import axios, { AxiosInstance } from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://94.130.37.51:3000/api';

class APIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token to requests
    this.client.interceptors.request.use((config) => {
      let token = Cookies.get('auth_token');
      if (!token && typeof window !== 'undefined') {
        token = localStorage.getItem('auth_token') || undefined;
      }
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle auth errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          Cookies.remove('auth_token');
          if (typeof window !== 'undefined') {
            localStorage.removeItem('auth_token');
          }
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    return response.data;
  }

  async register(name: string, email: string, password: string) {
    const response = await this.client.post('/auth/register', { name, email, password });
    return response.data;
  }

  async getMe() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  // Decks endpoints
  async getDecks() {
    const response = await this.client.get('/decks');
    return response.data;
  }

  async getDeck(id: string) {
    const response = await this.client.get(`/decks/${id}`);
    return response.data;
  }

  async createDeck(data: { name: string; description?: string; folderId?: string }) {
    const response = await this.client.post('/decks', data);
    return response.data;
  }

  async updateDeck(id: string, data: { name?: string; description?: string; folderId?: string }) {
    const response = await this.client.put(`/decks/${id}`, data);
    return response.data;
  }

  async deleteDeck(id: string) {
    const response = await this.client.delete(`/decks/${id}`);
    return response.data;
  }

  // Cards endpoints
  async getCards(deckId: string) {
    const response = await this.client.get(`/cards/${deckId}`);
    return response.data;
  }

  async createCard(data: { deckId: string; front: string; back: string }) {
    const response = await this.client.post(`/cards/${data.deckId}`, {
      cards: [{
        id: `${data.deckId}_${Date.now()}`,
        question: data.front,
        answer: data.back,
        learned: false
      }]
    });
    return response.data;
  }

  async updateCard(id: string, data: { front?: string; back?: string }) {
    const response = await this.client.put(`/cards/${id}`, data);
    return response.data;
  }

  async deleteCard(id: string) {
    const response = await this.client.delete(`/cards/${id}`);
    return response.data;
  }

  // Folders endpoints
  async getFolders() {
    const response = await this.client.get('/folders');
    return response.data;
  }

  async createFolder(data: { name: string }) {
    const response = await this.client.post('/folders', data);
    return response.data;
  }

  async updateFolder(id: string, data: { name: string }) {
    const response = await this.client.put(`/folders/${id}`, data);
    return response.data;
  }

  async deleteFolder(id: string) {
    const response = await this.client.delete(`/folders/${id}`);
    return response.data;
  }

  // Audio endpoints
  async getAudioFiles() {
    const response = await this.client.get('/audio');
    return response.data;
  }

  async uploadAudio(formData: FormData) {
    const response = await this.client.post('/audio', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async deleteAudio(id: string) {
    const response = await this.client.delete(`/audio/${id}`);
    return response.data;
  }

  // PDF endpoints
  async getPDFs() {
    const response = await this.client.get('/pdfs');
    return response.data;
  }

  async uploadPDF(formData: FormData) {
    const response = await this.client.post('/pdfs', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async deletePDF(id: string) {
    const response = await this.client.delete(`/pdfs/${id}`);
    return response.data;
  }
}

export const apiClient = new APIClient();
