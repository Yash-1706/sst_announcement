import type { Announcement } from '@/types'
import { isAnnouncementExpired } from './dateUtils'
import { PriorityLevel, numberToPriority, priorityToNumber } from './priorityMapping'

export type UserRole = 'student' | 'student_admin' | 'admin' | 'super_admin'

export const normalizeUserRole = (role: string | undefined, isAdmin?: boolean): UserRole => {
  if (!role) {
    return isAdmin ? 'admin' : 'student'
  }
  
  const roleMapping: Record<string, UserRole> = {
    'user': 'student',
    'student': 'student',
    'student_admin': 'student_admin', 
    'admin': 'admin',
    'super_admin': 'super_admin'
  }
  
  return roleMapping[role] || (isAdmin ? 'admin' : 'student')
}

export const hasAdminAccess = (userRole: UserRole): boolean => {
  return ['admin', 'student_admin', 'super_admin'].includes(userRole)
}

export const getAnnouncementPriority = (userRole: UserRole): number => {
  const announcementPriority: Record<UserRole, number> = {
    student: 1,
    student_admin: 2,
    admin: 3,          
    super_admin: 4,
  }
  return announcementPriority[userRole] || 1
}

export const getMaxPriorityForRole = (userRole: UserRole): PriorityLevel => {
  const maxPriority: Record<UserRole, PriorityLevel> = {
    student: 'P3',           
    student_admin: 'P2',      
    admin: 'P1',             
    super_admin: 'P0',        
  }
  return maxPriority[userRole] || 'P3'
}

export const getMaxPriorityNumberForRole = (userRole: UserRole): number => {
  const maxPriority = getMaxPriorityForRole(userRole)
  return priorityToNumber(maxPriority)
}

export const canSetPriorityLevel = (userRole: UserRole, priorityLevel: number): boolean => {
  const maxPriorityNum = getMaxPriorityNumberForRole(userRole)
  return priorityLevel >= 0 && priorityLevel <= maxPriorityNum
}

export const getAccessLevel = (userRole: UserRole): number => {
  const accessHierarchy: Record<UserRole, number> = {
    student: 1,
    student_admin: 2,  
    admin: 2,          
    super_admin: 3,
  }
  return accessHierarchy[userRole] || 1
}

export const isVisibleToUser = (
  announcement: Announcement, 
  userRole: UserRole = 'student',
  isAdmin?: boolean, 
  userId?: number, 
  isSuperAdmin?: boolean,
  studentIntakeCode?: number | null
): boolean => {
  const hasAdminLevel = hasAdminAccess(userRole)
  const now = new Date()
  
  if (!hasAdminLevel && !isSuperAdmin) {
    if (announcement.status === 'scheduled') {
      return false
    }
    
    if (announcement.category && announcement.category.toLowerCase() === 'scheduled') {
      return false
    }
    
    if (announcement.scheduled_at) {
      const scheduledDate = new Date(announcement.scheduled_at)
      if (!isNaN(scheduledDate.getTime()) && scheduledDate > now) {
        return false
      }
    }

    const targetYears = Array.isArray(announcement.target_years) ? announcement.target_years : null
    if (targetYears && targetYears.length > 0) {
      if (!studentIntakeCode || !targetYears.includes(studentIntakeCode)) {
        return false
      }
    }
  }
  
  return true
}

export const filterByCategory = (announcements: Announcement[], category: string): Announcement[] => {
  if (category === 'all') return announcements
  return announcements.filter(a => a.category.toLowerCase() === category.toLowerCase())
}

export const searchAnnouncements = (announcements: Announcement[], query: string): Announcement[] => {
  if (!query.trim()) return announcements
  const lowerQuery = query.toLowerCase()
  return announcements.filter(a => 
    a.title.toLowerCase().includes(lowerQuery) || 
    a.description.toLowerCase().includes(lowerQuery)
  )
}

export const sortAnnouncementsByPriority = (announcements: Announcement[], userRole: UserRole): Announcement[] => {
  return [...announcements].sort((a, b) => {
    if (a.is_emergency && !b.is_emergency) return -1
    if (!a.is_emergency && b.is_emergency) return 1
    
    const aPriorityNum = a.priority_level ?? 3
    const bPriorityNum = b.priority_level ?? 3
    
    const aDate = new Date(a.created_at || 0)
    const bDate = new Date(b.created_at || 0)
    const timeDiff = Math.abs(aDate.getTime() - bDate.getTime())
    
    const SAME_TIME_THRESHOLD = 1000 
    if (timeDiff <= SAME_TIME_THRESHOLD) {
      if (aPriorityNum !== bPriorityNum) {
        return aPriorityNum - bPriorityNum 
      }
      return (b.id ?? 0) - (a.id ?? 0)
    }
    
      if (aPriorityNum !== bPriorityNum) {
      return aPriorityNum - bPriorityNum 
    }
    
    const aPriorityUntil = a.priority_until ? new Date(a.priority_until) : null
    const bPriorityUntil = b.priority_until ? new Date(b.priority_until) : null
    const now = new Date()
    
    const aHasPriority = aPriorityUntil && aPriorityUntil > now && a.status === 'urgent'
    const bHasPriority = bPriorityUntil && bPriorityUntil > now && b.status === 'urgent'
    
    if (aHasPriority && !bHasPriority) return -1
    if (!aHasPriority && bHasPriority) return 1
    
    return bDate.getTime() - aDate.getTime()
  })
}

export const filterAnnouncementsByRole = (announcements: Announcement[], userRole: UserRole): Announcement[] => {
  return announcements.filter(announcement => {
    if (userRole === 'super_admin') return true
    
    if (userRole === 'admin') {
      return true
    }
    
    if (userRole === 'student_admin') {
      return true
    }
    
    return announcement.status === 'active' && announcement.is_active !== false
  })
}

export const getUniqueCategories = (announcements: Announcement[], userRole: UserRole): string[] => {
  const categories = new Set<string>()
  
  announcements.forEach(announcement => {
    if (isVisibleToUser(announcement, userRole)) {
      categories.add(announcement.category)
    }
  })
  
  return Array.from(categories).sort()
}

export const canPerformAdminActions = (userRole: UserRole): boolean => {
  return hasAdminAccess(userRole)
}

export const canManageUsers = (userRole: UserRole): boolean => {
  return userRole === 'super_admin'
}

export const getRoleDisplay = (role: UserRole): string => {
  const roleDisplayMap: Record<UserRole, string> = {
    student: 'Student',
    student_admin: 'Student Admin',
    admin: 'Admin',
    super_admin: 'Super Admin'
  }
  return roleDisplayMap[role] || 'Student'
}