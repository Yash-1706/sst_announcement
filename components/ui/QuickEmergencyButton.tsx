'use client'

import React, { useState } from 'react'
import { Button } from './button'
import { apiService } from '@/services/api'
import { useToast } from '@/hooks/useToast'

interface QuickEmergencyButtonProps {
  onSuccess?: () => void
}

const QuickEmergencyButton: React.FC<QuickEmergencyButtonProps> = ({ onSuccess }) => {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleQuickEmergency = async () => {
    setLoading(true)
    try {
      const emergencyData = {
        title: 'URGENT: Emergency Alert',
        description: 'An emergency situation has been reported. Please follow safety protocols and await further instructions.',
        category: 'emergency',
        is_emergency: true,
        is_active: true,
        status: 'active',
        send_email: true,
        send_tv: true
      }
      
      const response = await apiService.createAnnouncement(emergencyData)
      if (response.success) {
        showToast('🚨 Emergency alert sent to all users!', 'success')
        onSuccess?.()
        setShowConfirm(false)
      } else {
        showToast(response.error || 'Failed to send emergency alert', 'error')
      }
    } catch (error) {
      console.error('Emergency alert error:', error)
      showToast('Error sending emergency alert', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (showConfirm) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-br from-red-900/95 to-gray-900/95 backdrop-blur-xl rounded-2xl p-6 border border-red-500/50 shadow-2xl shadow-red-500/20 max-w-md w-full">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            
            <h3 className="text-xl font-bold text-white mb-2">🚨 Send Emergency Alert?</h3>
            <p className="text-gray-300 mb-6">
              This will immediately send an emergency notification to all users and display prominently on the dashboard.
            </p>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleQuickEmergency}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Sending...
                  </div>
                ) : (
                  '🚨 Send Alert'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Button
      onClick={() => setShowConfirm(true)}
      className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 h-auto border-0 shadow-lg shadow-red-600/30 transition-all duration-200"
    >
      Quick Emergency
    </Button>
  )
}

export default QuickEmergencyButton
