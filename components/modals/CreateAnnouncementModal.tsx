import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import type { CreateAnnouncementData } from '../../types';
import { CATEGORY_OPTIONS } from '../../constants/categories';
import { useAppUser } from '../../contexts/AppUserContext';
import { getPriorityForCategory, priorityToNumber, numberToPriority, getPriorityDisplayName, getPriorityExamples } from '../../utils/priorityMapping';
import { getMaxPriorityForRole, getMaxPriorityNumberForRole, canSetPriorityLevel, normalizeUserRole, hasAdminAccess } from '../../utils/announcementUtils';
import { formatDateTime } from '../../utils/dateUtils';

const DEFAULT_FORM_STATE: CreateAnnouncementData = {
  title: '',
  description: '',
  category: 'college',
  expiry_date: '',
  scheduled_at: '',
  reminder_time: '',
  is_active: true,
  status: 'active',
  send_email: false,
  send_tv: false,
  priority_until: null,
  is_emergency: false,
  priority_level: 3, 
};

const PRIORITY_DURATION_OPTIONS = [1, 2, 4, 6, 12, 24];

const convertLocalInputToUTC = (value?: string | null) => {
  if (!value) return value;
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toISOString();
};

interface CreateAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateAnnouncementData) => Promise<void>;
  loading?: boolean;
  initialData?: Partial<CreateAnnouncementData>;
  variant?: 'standard' | 'emergency';
  emergencyMode?: boolean; 
}

const CreateAnnouncementModal: React.FC<CreateAnnouncementModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
  initialData,
  variant = 'standard',
  emergencyMode = false,
}) => {
  const { user } = useAppUser();
  const normalizedRole = normalizeUserRole(user?.role, user?.is_admin);
  const isSuperAdmin = normalizedRole === 'super_admin';
  const hasAdmin = hasAdminAccess(normalizedRole);
  const userRole = normalizedRole;
  const maxPriority = getMaxPriorityForRole(userRole);
  const maxPriorityNum = getMaxPriorityNumberForRole(userRole);
  
  const [formData, setFormData] = useState<CreateAnnouncementData>(DEFAULT_FORM_STATE);
  const [priorityDurationHours, setPriorityDurationHours] = useState<number>(2);
  const [emergencyDurationHours, setEmergencyDurationHours] = useState<number>(4);
  const [minScheduledDate, setMinScheduledDate] = useState<string>('');

  const isEmergencyVariant = variant === 'emergency' || emergencyMode;

  const formatToLocalDateTime = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  useEffect(() => {
    if (isOpen) {
      const dayAfterTomorrow = new Date();
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
      dayAfterTomorrow.setHours(0, 0, 0, 0);
      
      const dayAfterTomorrowFormatted = formatToLocalDateTime(dayAfterTomorrow);
      
      setMinScheduledDate(dayAfterTomorrowFormatted);
      
      const initialCategory = initialData?.category || 'college';
      const autoPriority = getPriorityForCategory(initialCategory);
      const autoPriorityNum = priorityToNumber(autoPriority);
      
      setFormData({
        ...DEFAULT_FORM_STATE,
        ...(initialData || {}),
        is_emergency: isEmergencyVariant,
        priority_level: initialData?.priority_level ?? autoPriorityNum,
        scheduled_at: isEmergencyVariant ? '' : (initialData?.scheduled_at || dayAfterTomorrowFormatted),
      });
      setPriorityDurationHours(2);
      setEmergencyDurationHours(4);
    }
  }, [isOpen, initialData, isEmergencyVariant]);
  
  useEffect(() => {
    if (formData.category && !isEmergencyVariant) {
      const autoPriority = getPriorityForCategory(formData.category);
      const autoPriorityNum = priorityToNumber(autoPriority);
      if (canSetPriorityLevel(userRole, autoPriorityNum)) {
        setFormData(prev => ({ ...prev, priority_level: autoPriorityNum }));
      } else {
        setFormData(prev => ({ ...prev, priority_level: maxPriorityNum }));
      }
    }
  }, [formData.category, userRole, maxPriorityNum, isEmergencyVariant]);

  useEffect(() => {
    if (isOpen && isEmergencyVariant && formData.scheduled_at) {
      setFormData(prev => ({ ...prev, scheduled_at: '' })); 
    }
  }, [isOpen, isEmergencyVariant, formData.scheduled_at]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let submission: CreateAnnouncementData = {
      ...formData,
      priority_level: formData.priority_level ?? 3, 
    };

    if (isEmergencyVariant) {
      if (variant === 'emergency') {
        const priorityExpiresAt = new Date(Date.now() + priorityDurationHours * 60 * 60 * 1000);
        submission.priority_until = priorityExpiresAt.toISOString();
        submission.expiry_date = priorityExpiresAt.toISOString();
        submission.status = 'urgent';
        submission.send_email = true;
        submission.send_tv = true;
        submission.is_active = true;
        submission.priority_level = 0; 
      } else {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + emergencyDurationHours * 60 * 60 * 1000);
        submission = {
          ...formData,
          is_emergency: true,
          is_active: true,
          emergency_expires_at: expiresAt.toISOString(),
          scheduled_at: '',
          expiry_date: '',
          reminder_time: '',
          priority_level: 0, 
        };
      }
    } else {
      submission.priority_until = submission.priority_until || null;
      const requestedPriority = submission.priority_level ?? 3;
      if (!canSetPriorityLevel(userRole, requestedPriority)) {
        submission.priority_level = maxPriorityNum; 
      }
    }

    submission = {
      ...submission,
      scheduled_at: convertLocalInputToUTC(submission.scheduled_at) ?? '',
      expiry_date: convertLocalInputToUTC(submission.expiry_date) ?? '',
      reminder_time: convertLocalInputToUTC(submission.reminder_time) ?? '',
      priority_until: convertLocalInputToUTC(submission.priority_until) ?? null,
      emergency_expires_at: convertLocalInputToUTC(submission.emergency_expires_at) ?? undefined,
    };

    await onSubmit(submission);
    setFormData(DEFAULT_FORM_STATE);
    setPriorityDurationHours(2);
    setEmergencyDurationHours(4);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-black rounded-3xl border border-gray-900 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden m-4 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 flex flex-col">
        <div className={`relative p-6 border-b border-gray-900 ${isEmergencyVariant ? 'bg-gradient-to-r from-red-900/40 via-red-900/10 to-black' : 'bg-black'}`}>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ring-2 ring-white/10 ${isEmergencyVariant ? 'bg-gradient-to-br from-red-600 to-orange-500' : 'bg-black'}`}>
                  <svg className={`w-6 h-6 ${isEmergencyVariant ? 'text-white animate-pulse' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isEmergencyVariant ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 18a2 2 0 01-1 1.732l-7 4a2 2 0 01-2 0l-7-4A2 2 0 013 18V6a2 2 0 011-1.732l7-4a2 2 0 012 0l7 4A2 2 0 0121 6z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    )}
                  </svg>
                </div>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                  {isEmergencyVariant ? (
                    <>
                      <span className="text-red-400">🚨</span>
                      {variant === 'emergency' ? 'Emergency Broadcast' : 'Create Emergency Announcement'}
                    </>
                  ) : (
                    'Create New Announcement'
                  )}
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {isEmergencyVariant 
                    ? (variant === 'emergency' 
                        ? 'Send an urgent campus-wide alert. These announcements are prioritized for all users.'
                        : 'Emergency announcements are immediately visible and active')
                    : 'Fill in the details below to create your announcement'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-all duration-200 p-2 hover:bg-gray-900 rounded-lg hover:rotate-90"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 bg-black custom-scrollbar">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-300">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-3 bg-black/70 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600/40 focus:border-blue-600/40 transition-all duration-200 hover:border-gray-700"
              placeholder="Enter a compelling title for your announcement"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-300">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={5}
              className="w-full px-4 py-3 bg-black/70 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-600/40 focus:border-purple-600/40 transition-all duration-200 resize-none hover:border-gray-700"
              placeholder="Provide detailed information about your announcement..."
            />
            <p className="text-xs text-gray-500">{formData.description.length} characters</p>
          </div>

          {isEmergencyVariant && (
            <div className="space-y-3 rounded-2xl border border-red-800/50 bg-red-900/10 p-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-red-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 18a2 2 0 01-1 1.732l-7 4a2 2 0 01-2 0l-7-4A2 2 0 013 18V6a2 2 0 011-1.732l7-4a2 2 0 012 0l7 4A2 2 0 0121 6z" />
                </svg>
                {variant === 'emergency' ? 'Priority window' : 'Duration (How long it will be on top)'}
                <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-red-200/80">
                {variant === 'emergency' 
                  ? 'Emergency alerts stay pinned to the top and expire completely after this time.'
                  : 'Emergency announcements will automatically expire and be removed after the specified duration'}
              </p>
              
              {variant === 'emergency' ? (
                <div className="flex flex-wrap gap-2">
                  {PRIORITY_DURATION_OPTIONS.map((hours) => {
                    const isActive = priorityDurationHours === hours;
                    return (
                      <button
                        key={hours}
                        type="button"
                        onClick={() => setPriorityDurationHours(hours)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                          isActive
                            ? 'bg-red-600 text-white shadow-lg shadow-red-600/40'
                            : 'bg-red-900/40 text-red-200 hover:bg-red-800/40'
                        }`}
                      >
                        {hours}h
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="1"
                        max="168"
                        value={emergencyDurationHours}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 1;
                          setEmergencyDurationHours(Math.max(1, Math.min(168, value)));
                        }}
                        className="w-20 px-4 py-2.5 bg-black/70 border border-red-500/40 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600/50 focus:border-red-600/50 transition-all duration-200 hover:border-red-500/60 text-center font-semibold"
                        placeholder="4"
                        required
                      />
                      <div className="flex flex-col">
                        <span className="text-white/90 text-sm font-medium">hours</span>
                        <span className="text-gray-500 text-xs">(1-168)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <p className="text-xs text-red-100">
                Will expire completely on{' '}
                {variant === 'emergency'
                  ? formatDateTime(Date.now() + priorityDurationHours * 60 * 60 * 1000, {
                      hour: '2-digit',
                      minute: '2-digit',
                      month: 'short',
                      day: 'numeric',
                    })
                  : (() => {
                      const now = new Date();
                      const expiresAt = new Date(now.getTime() + emergencyDurationHours * 60 * 60 * 1000);
                      return formatDateTime(expiresAt, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                    })()}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-300">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Category <span className="text-red-400">*</span>
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-3 bg-black/70 border border-gray-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600/40 transition-all duration-200 hover:border-gray-700 cursor-pointer"
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat.value} value={cat.value} className="bg-gray-900">
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {!isEmergencyVariant && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Schedule & Timing
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Expiry Date
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.expiry_date || ''}
                    onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-800/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200 hover:border-gray-600"
                  />
                </div>
                {hasAdmin && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                      <svg className="w-3.5 h-3.5 text-cyan-500/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Scheduled At
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.scheduled_at || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value) {
                          const [datePart] = value.split('T');
                          const formattedValue = `${datePart}T00:00`;
                          setFormData({ ...formData, scheduled_at: formattedValue });
                        } else {
                          setFormData({ ...formData, scheduled_at: '' });
                        }
                      }}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (value) {
                          const [datePart] = value.split('T');
                          const formattedValue = `${datePart}T00:00`;
                          if (formattedValue !== value) {
                            setFormData({ ...formData, scheduled_at: formattedValue });
                          }
                        }
                      }}
                      min={minScheduledDate}
                      className="w-full px-4 py-2.5 bg-gray-800/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200 hover:border-gray-600"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    Reminder Time
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.reminder_time || ''}
                    onChange={(e) => setFormData({ ...formData, reminder_time: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-800/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200 hover:border-gray-600"
                  />
                </div>
              </div>
            </div>
          )}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-300">
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </label>
            
            <div className="bg-gray-900/30 border border-gray-800/50 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg transition-colors duration-200 ${
                    formData.is_active || isEmergencyVariant
                      ? 'bg-emerald-500/20 text-emerald-400' 
                      : 'bg-gray-800/50 text-gray-500'
                  }`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-200 block">
                      {isEmergencyVariant ? 'Active (Emergency)' : (formData.is_active ? 'Active' : 'Inactive')}
                    </span>
                    <span className="text-xs text-gray-500">
                      {isEmergencyVariant 
                        ? 'Emergency announcements are always active' 
                        : (formData.is_active ? 'Announcement will be visible' : 'Announcement will be hidden')}
                    </span>
                  </div>
                </div>
                <label className={`relative inline-flex items-center ${isEmergencyVariant ? 'cursor-not-allowed opacity-70' : 'cursor-pointer group-hover:scale-105'} transition-transform duration-200`}>
                  <input
                    type="checkbox"
                    checked={isEmergencyVariant ? true : (formData.is_active ?? true)}
                    onChange={(e) => {
                      if (!isEmergencyVariant) {
                        setFormData({ ...formData, is_active: e.target.checked });
                      }
                    }}
                    disabled={isEmergencyVariant}
                    className="sr-only"
                  />
                  <div className={`relative w-14 h-7 rounded-full transition-all duration-300 ease-in-out ${
                    (formData.is_active ?? true) || isEmergencyVariant
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/50' 
                      : 'bg-gray-700 border border-gray-600'
                  }`}>
                    <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${
                      (formData.is_active ?? true) || isEmergencyVariant ? 'translate-x-7' : 'translate-x-0'
                    }`}>
                      {((formData.is_active ?? true) || isEmergencyVariant) && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              </div>

              <div className="h-px bg-gray-800/50"></div>

              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg transition-colors duration-200 ${
                    formData.send_email 
                      ? 'bg-blue-500/20 text-blue-400' 
                      : 'bg-gray-800/50 text-gray-500'
                  }`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-200 block">
                      Send Email Notification
                    </span>
                    <span className="text-xs text-gray-500">
                      {formData.send_email ? 'Users will receive email alerts' : 'No email will be sent'}
                    </span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer group-hover:scale-105 transition-transform duration-200">
                  <input
                    type="checkbox"
                    checked={formData.send_email ?? false}
                    onChange={(e) => setFormData({ ...formData, send_email: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`relative w-14 h-7 rounded-full transition-all duration-300 ease-in-out ${
                    formData.send_email 
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg shadow-blue-500/50' 
                      : 'bg-gray-700 border border-gray-600'
                  }`}>
                    <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${
                      formData.send_email ? 'translate-x-7' : 'translate-x-0'
                    }`}>
                      {formData.send_email && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg transition-colors duration-200 ${
                    formData.send_tv 
                      ? 'bg-purple-500/20 text-purple-400' 
                      : 'bg-gray-800/50 text-gray-500'
                  }`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-200 block">
                      Send to TV Display
                    </span>
                    <span className="text-xs text-gray-500">
                      {formData.send_tv ? 'Will appear on TV screens' : 'Not sent to TV'}
                    </span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer group-hover:scale-105 transition-transform duration-200">
                  <input
                    type="checkbox"
                    checked={formData.send_tv ?? false}
                    onChange={(e) => setFormData({ ...formData, send_tv: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`relative w-14 h-7 rounded-full transition-all duration-300 ease-in-out ${
                    formData.send_tv 
                      ? 'bg-gradient-to-r from-purple-500 to-purple-600 shadow-lg shadow-purple-500/50' 
                      : 'bg-gray-700 border border-gray-600'
                  }`}>
                    <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${
                      formData.send_tv ? 'translate-x-7' : 'translate-x-0'
                    }`}>
                      {formData.send_tv && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-800/50">
            <Button
              type="submit"
              disabled={loading}
              className={`flex-1 font-semibold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg ${
                isEmergencyVariant
                  ? 'bg-gradient-to-r from-red-600 via-red-600 to-red-600 hover:from-red-700 hover:via-red-700 hover:to-red-700 text-white shadow-red-500/20 hover:shadow-red-500/30'
                  : 'bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 hover:from-blue-700 hover:via-purple-700 hover:to-blue-700 text-white shadow-blue-500/20 hover:shadow-blue-500/30'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {isEmergencyVariant ? 'Creating Emergency...' : 'Creating...'}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {isEmergencyVariant ? 'Create Emergency Announcement' : 'Create Announcement'}
                </span>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="px-6 py-3 border-gray-700/50 text-gray-300 hover:bg-gray-800/50 hover:text-white hover:border-gray-600 rounded-xl transition-all duration-200"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateAnnouncementModal;