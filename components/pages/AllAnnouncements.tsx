'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { apiService } from '@/services/api'
import type { Announcement } from '@/types'
import { useAppUser } from '@/contexts/AppUserContext'
import { isAnnouncementExpired } from '@/utils/dateUtils'
import { getCategoryColor, getCategoryIcon } from '@/constants/categoryStyles'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '../ui/toast'
import { isVisibleToUser, normalizeUserRole, hasAdminAccess, type UserRole } from '@/utils/announcementUtils'
import { extractIntakeCodeFromEmail } from '@/utils/studentYear'
import { parseLinks } from '@/utils/linkParser'

interface AllAnnouncementsProps {
  onBackToDashboard: () => void
}

const AllAnnouncements: React.FC<AllAnnouncementsProps> = ({ onBackToDashboard }) => {
  const { user } = useAppUser()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const { toasts, showToast, removeToast } = useToast()

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)
      const response = await apiService.getAnnouncements()
      if (response.success && response.data) {
        setAnnouncements(response.data)
      } else {
        showToast('Failed to load announcements', 'error')
      }
    } catch (error) {
      console.error('Error fetching announcements:', error)
      showToast('Error loading announcements', 'error')
    } finally {
      setLoading(false)
    }
  }

  const categories = ['all', 'college', 'tech-events', 'sports', 'cultural', 'academic']

  // Determine user role and intake code for filtering
  const derivedRole: UserRole = normalizeUserRole(user?.role, user?.is_admin)
  const isSuperAdmin = derivedRole === 'super_admin'
  const userIntakeCode = user?.email ? extractIntakeCodeFromEmail(user.email) : null

  // Filter announcements by visibility (intake year targeting) and category
  const filteredAnnouncements = announcements
    .filter(announcement => 
      isVisibleToUser(
        announcement,
        derivedRole,
        user?.is_admin || false,
        user?.id,
        isSuperAdmin,
        userIntakeCode
      )
    )
    .filter(announcement => {
      if (selectedCategory === 'all') return true
      return announcement.category === selectedCategory
    })

  return (
    <div className="min-h-screen bg-gray-950">  
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 bg-gray-900/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-800/50">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              All Announcements
            </h1>
            <p className="text-gray-400">Browse all announcements from the SST community</p>
          </div>
          <Button
            onClick={onBackToDashboard}
            variant="outline"
            className="border-gray-700 text-gray-300 bg-transparent hover:bg-gray-800 hover:text-white transition-all duration-200"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </Button>
        </div>

        {/* Category Filter */}
        <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-800/50 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Filter by Category</h3>
            <span className="text-sm text-gray-400">{filteredAnnouncements.length} announcements</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 capitalize ${
                  selectedCategory === category 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' 
                    : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700/50'
                }`}
              >
                {category === 'all' ? 'All Categories' : category.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Announcements Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-gray-900/50 border border-gray-800/50 rounded-2xl p-6 animate-pulse">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-3/4 h-5 bg-gray-800 rounded-lg"></div>
                  <div className="w-16 h-6 bg-gray-800 rounded-full"></div>
                </div>
                <div className="space-y-3 mb-4">
                  <div className="w-full h-3 bg-gray-800 rounded-lg"></div>
                  <div className="w-4/5 h-3 bg-gray-800 rounded-lg"></div>
                  <div className="w-3/5 h-3 bg-gray-800 rounded-lg"></div>
                </div>
                <div className="flex justify-between">
                  <div className="w-20 h-3 bg-gray-800 rounded-lg"></div>
                  <div className="w-16 h-3 bg-gray-800 rounded-lg"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAnnouncements.map((announcement, index) => {
                const isEmergency = announcement.is_emergency || false
                const isExpired = isAnnouncementExpired(announcement)
                return (
                <Card 
                  key={announcement.id} 
                  className={`group relative overflow-hidden backdrop-blur-sm border transition-all duration-300 ${
                    isExpired 
                      ? 'opacity-60 grayscale bg-gray-800/30 border-gray-700/30 pointer-events-none' 
                      : `hover:-translate-y-1 hover:shadow-xl ${
                          isEmergency
                            ? 'bg-red-900/30 border-red-500/50 hover:border-red-400 hover:shadow-red-500/20'
                            : 'bg-gray-900/50 border-gray-800/50 hover:border-gray-700 hover:shadow-gray-900/50'
                        }`
                  }`}
                >
                  {/* Category accent bar */}
                  <div className={`absolute top-0 left-0 right-0 h-1 ${
                    isExpired ? 'bg-gray-600' : (isEmergency ? 'bg-red-500' : 'bg-blue-500')
                  }`}></div>
                  
                  <CardHeader className="relative pb-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                        {isExpired && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-600/50 text-gray-300">
                            ⏰ EXPIRED
                          </span>
                        )}
                        {isEmergency && !isExpired && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 animate-pulse">
                            🚨 EMERGENCY
                          </span>
                        )}
                        
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                          isExpired 
                            ? 'bg-gray-600/50 text-gray-400' 
                            : (isEmergency ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800')
                        }`}>
                          {announcement.category.replace('-', ' ')}
                        </span>
                      </div>
                    </div>
                    <CardTitle className="text-xl font-bold text-white leading-tight select-text cursor-text mb-2">
                      {announcement.title}
                    </CardTitle>
                  </CardHeader>
                  
                  <CardContent className="relative">
                    <CardDescription className="text-sm text-gray-300 leading-relaxed mb-4 select-text cursor-text">
                      {parseLinks(announcement.description)}
                    </CardDescription>
                    
                    {/* Metadata */}
                    <div className="flex items-center justify-between text-xs pt-4 border-t border-gray-800/30">
                      <div className="flex items-center gap-2 text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="select-text cursor-text">
                          {announcement.created_at ? new Date(announcement.created_at).toLocaleDateString() : 'Unknown date'}
                        </span>
                      </div>
                      {announcement.expiry_date && (
                        <div className="flex items-center gap-2 text-gray-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="select-text cursor-text">
                            Expires {new Date(announcement.expiry_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                )
              })}
            </div>

            {filteredAnnouncements.length === 0 && !loading && (
              <div className="text-center py-16 bg-gray-900/30 rounded-2xl border border-gray-800/50">
                <div className="w-20 h-20 bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-300 mb-2">No announcements found</h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  {selectedCategory === 'all' 
                    ? 'There are no announcements available at the moment. Check back later for updates.'
                    : `No announcements found in the "${selectedCategory.replace('-', ' ')}" category. Try selecting a different category.`
                  }
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}

export default AllAnnouncements