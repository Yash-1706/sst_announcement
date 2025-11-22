import { getConfig } from '@/config/config'
import type {
  Announcement,
  User,
  CreateAnnouncementData,
  UpdateAnnouncementData,
  ApiResponse,
  AnalyticsStats,
  AdminDashboardData,
  AdminLimits,
  AdminConfigInfo,
} from '@/types'

const API_BASE_URL = getConfig().backendUrl

type TokenProvider = () => Promise<string | null>

let authTokenProvider: TokenProvider | null = null

export function registerAuthTokenProvider(provider: TokenProvider | null) {
  authTokenProvider = provider
}

class ApiService {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      }

      if (authTokenProvider) {
        try {
          const token = await authTokenProvider()
          if (token) {
            headers['Authorization'] = `Bearer ${token}`
          }
        } catch (tokenError) {
          console.warn('Failed to resolve auth token', tokenError)
        }
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers,
        credentials: 'include', // Include cookies for CORS with credentials
        ...options, 
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle backend error responses
        const errorMessage = data.message || data.error || `HTTP error! status: ${response.status}`
        return {
          success: false,
          error: errorMessage
        }
      }

      // Handle different response formats from backend
      // Some endpoints return { data: ... }, others return { success: true, data: ... }
      // or just the data directly
      if (data.success !== undefined) {
        // Response has success field
        return { success: data.success, data: data.data, error: data.error }
      } else if (data.data !== undefined) {
        // Response has data field
        return { success: true, data: data.data }
      } else {
        // Response is the data itself
        return { success: true, data: data }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }

  async getAnnouncements(status?: string): Promise<ApiResponse<Announcement[]>> {
    const endpoint = status ? `/api/announcements/?status=${encodeURIComponent(status)}` : '/api/announcements/'
    return this.request<Announcement[]>(endpoint)
  }

  async getAnnouncementById(id: number): Promise<ApiResponse<Announcement>> {
    return this.request<Announcement>(`/api/announcements/${id}`)
  }

  // Announcement CRUD operations
  async createAnnouncement(data: CreateAnnouncementData): Promise<ApiResponse<Announcement>> {
    return this.request<Announcement>('/api/announcements/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateAnnouncement(id: number, data: UpdateAnnouncementData): Promise<ApiResponse<Announcement>> {
    return this.request<Announcement>(`/api/announcements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteAnnouncement(id: number): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/announcements/${id}`, {
      method: 'DELETE',
    })
  }

  // Announcement v1 features
  async scheduleAnnouncement(announcementId: number, scheduledAt: string): Promise<ApiResponse<any>> {
    return this.request<any>('/api/announcements/schedule', {
      method: 'POST',
      body: JSON.stringify({ announcement_id: announcementId, scheduled_at: scheduledAt })
    })
  }

  async setAnnouncementReminder(announcementId: number, reminderTime: string): Promise<ApiResponse<any>> {
    return this.request<any>('/api/announcements/reminder', {
      method: 'POST',
      body: JSON.stringify({ announcement_id: announcementId, reminder_time: reminderTime })
    })
  }

  // Analytics
  async trackEngagement(announcementId: number, eventType: 'view'|'click'|'dismiss'): Promise<ApiResponse<any>> {
    return this.request<any>('/api/analytics/track', {
      method: 'POST',
      body: JSON.stringify({ announcement_id: announcementId, event_type: eventType })
    })
  }

  async getAnalyticsStats(): Promise<ApiResponse<AnalyticsStats>> {
    return this.request<AnalyticsStats>('/api/analytics/stats')
  }

  // Admin utilities
  async getAdminLimits(): Promise<ApiResponse<AdminLimits>> {
    return this.request<AdminLimits>('/api/admin/limits')
  }

  async getAdminConfig(): Promise<ApiResponse<AdminConfigInfo>> {
    return this.request<AdminConfigInfo>('/api/admin/config')
  }

  // Admin user management
  async getAllUsers(): Promise<ApiResponse<User[]>> {
    return this.request<User[]>('/api/admin/users')
  }

  async getUserById(id: number): Promise<ApiResponse<User>> {
    return this.request<User>(`/api/admin/users/${id}`)
  }

  async searchUsersByEmail(email: string): Promise<ApiResponse<User>> {
    return this.request<User>(`/api/admin/users/search?email=${encodeURIComponent(email)}`)
  }

  async updateUserAdminStatus(id: number, isAdmin: boolean): Promise<ApiResponse<User>> {
    return this.request<User>(`/api/admin/users/${id}/admin-status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_admin: isAdmin }),
    })
  }

  async updateUserRole(id: number, role: string): Promise<ApiResponse<User>> {
    return this.request<User>(`/api/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
  }

  async getAdminDashboard(): Promise<ApiResponse<AdminDashboardData>> {
    return this.request<AdminDashboardData>('/api/admin/dashboard')
  }

  // User profile
  async getUserProfile(): Promise<ApiResponse<User>> {
    return this.request<User>('/api/profile')
  }

  // Review announcements
  async reviewAnnouncement(id: number, action: 'accept' | 'reject' | 'send_back', scheduled_at?: string): Promise<ApiResponse<Announcement>> {
    return this.request<Announcement>(`/api/announcements/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, scheduled_at }),
    })
  }

  // Debug (for development)
  async getDebugInfo(): Promise<ApiResponse<any>> {
    return this.request<any>('/api/debug')
  }
}

export const apiService = new ApiService(API_BASE_URL)

// Re-export types for convenience
export type {
  Announcement,
  User,
  CreateAnnouncementData,
  UpdateAnnouncementData,
  ApiResponse,
  AnalyticsStats,
  AdminDashboardData,
} from '@/types'
