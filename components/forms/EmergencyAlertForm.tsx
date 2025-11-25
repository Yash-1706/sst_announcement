'use client'

import React, { useState } from 'react'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { apiService } from '@/services/api'
import { useToast } from '@/hooks/useToast'
import type { CreateAnnouncementData } from '@/types'

interface EmergencyAlertFormProps {
  onClose: () => void
  onSuccess?: () => void
}

const EmergencyAlertForm: React.FC<EmergencyAlertFormProps> = ({ onClose, onSuccess }) => {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<CreateAnnouncementData>({
    title: '',
    description: '',
    category: 'emergency',
    is_active: true,
    status: 'active',
    send_email: true,
    send_tv: true,
    is_emergency: true,
    emergency_expires_at: '',
    target_years: null
  })

  const handleInputChange = (field: keyof CreateAnnouncementData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title.trim() || !formData.description.trim()) {
      showToast('Please fill in all required fields', 'error')
      return
    }

    setLoading(true)
    try {
      const response = await apiService.createAnnouncement(formData)
      if (response.success) {
        showToast('🚨 Emergency alert created and sent successfully!', 'success')
        onSuccess?.()
        onClose()
      } else {
        showToast(response.error || 'Failed to create emergency alert', 'error')
      }
    } catch (error) {
      console.error('Error creating emergency alert:', error)
      showToast('Error creating emergency alert', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-red-900/95 via-gray-900/95 to-gray-800/95 backdrop-blur-xl border border-red-500/50 shadow-2xl shadow-red-500/20">
        <CardHeader className="border-b border-red-500/30 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-bold text-white flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center animate-pulse">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              🚨 Create Emergency Alert
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-gray-400 hover:text-white hover:bg-red-800/50 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
          
          {/* Warning Notice */}
          <div className="mt-4 p-4 bg-red-500/20 border border-red-500/40 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 text-red-400 mt-0.5 animate-pulse">
                ⚠️
              </div>
              <div className="text-sm text-red-200">
                <p className="font-semibold mb-1">Emergency Alert Warning</p>
                <p>This will immediately send notifications to all users and display prominently on the dashboard. Use only for genuine emergencies.</p>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-red-200 mb-2">
                Emergency Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="e.g., Fire Drill, Security Alert, Weather Warning..."
                className="w-full px-4 py-3 rounded-xl bg-gray-800/60 border border-red-500/50 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-red-200 mb-2">
                Emergency Details <span className="text-red-400">*</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Provide clear instructions and important details about the emergency..."
                rows={4}
                className="w-full px-4 py-3 rounded-xl bg-gray-800/60 border border-red-500/50 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200 resize-none"
                required
              />
            </div>

            {/* Emergency Expiry */}
            <div>
              <label className="block text-sm font-semibold text-red-200 mb-2">
                Emergency Expires At (Optional)
              </label>
              <input
                type="datetime-local"
                value={formData.emergency_expires_at}
                onChange={(e) => handleInputChange('emergency_expires_at', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-800/60 border border-red-500/50 text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200"
              />
              <p className="text-xs text-gray-400 mt-1">
                Leave empty for permanent alert until manually removed
              </p>
            </div>

            {/* Options */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="send_email_emergency"
                  checked={formData.send_email}
                  onChange={(e) => handleInputChange('send_email', e.target.checked)}
                  className="w-4 h-4 text-red-600 bg-gray-800 border-red-500 rounded focus:ring-red-500 focus:ring-2"
                />
                <label htmlFor="send_email_emergency" className="text-sm font-medium text-red-200">
                  📧 Send immediate email notifications to all users
                </label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="send_tv_emergency"
                  checked={formData.send_tv ?? false}
                  onChange={(e) => handleInputChange('send_tv', e.target.checked)}
                  className="w-4 h-4 text-red-600 bg-gray-800 border-red-500 rounded focus:ring-red-500 focus:ring-2"
                />
                <label htmlFor="send_tv_emergency" className="text-sm font-medium text-red-200">
                  📺 Send to TV display screens
                </label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active_emergency"
                  checked={formData.is_active}
                  onChange={(e) => handleInputChange('is_active', e.target.checked)}
                  className="w-4 h-4 text-red-600 bg-gray-800 border-red-500 rounded focus:ring-red-500 focus:ring-2"
                />
                <label htmlFor="is_active_emergency" className="text-sm font-medium text-red-200">
                  🚨 Activate emergency alert immediately
                </label>
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white border-0 shadow-lg shadow-red-600/40"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Sending Alert...
                  </div>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    🚨 Send Emergency Alert
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default EmergencyAlertForm
