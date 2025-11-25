import React, { useEffect, useState } from 'react';

import { Button } from '../ui/button';
import type { Announcement, UpdateAnnouncementData } from '../../types';
import { CATEGORY_OPTIONS } from '../../constants/categories';
import { formatDateForInput } from '../../utils/dateUtils';
import { useAppUser } from '../../contexts/AppUserContext';
import { INTAKE_YEAR_OPTIONS } from '../../utils/studentYear';

interface EditAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcement: Announcement | null;
  onSubmit: (id: number, data: UpdateAnnouncementData) => Promise<void>;
  loading?: boolean;
}

const EditAnnouncementModal: React.FC<EditAnnouncementModalProps> = ({
  isOpen,
  onClose,
  announcement,
  onSubmit,
  loading = false,
}) => {
  const { user } = useAppUser();
  const isSuperAdmin = user?.role === 'super_admin';
  const [formData, setFormData] = useState<UpdateAnnouncementData>({
    title: '',
    description: '',
    category: 'college',
    expiry_date: '',
    scheduled_at: '',
    reminder_time: '',
    is_active: true,
    status: isSuperAdmin ? 'active' : 'under_review',
    target_years: null,
  });

  useEffect(() => {
    if (announcement) {
      setFormData({
        title: announcement.title,
        description: announcement.description,
        category: announcement.category,
        expiry_date: formatDateForInput(announcement.expiry_date),
        scheduled_at: formatDateForInput(announcement.scheduled_at),
        reminder_time: formatDateForInput(announcement.reminder_time),
        is_active: announcement.is_active ?? true,
        status: isSuperAdmin ? (announcement.status || 'active') : 'under_review',
        target_years: announcement.target_years ?? null,
      });
    }
  }, [announcement, isSuperAdmin]);

  if (!isOpen || !announcement || !announcement.id) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submissionData: UpdateAnnouncementData = { ...formData };
    if (!isSuperAdmin) {
      submissionData.status = 'under_review';
      delete submissionData.scheduled_at;
    }
    await onSubmit(announcement.id!, submissionData);
  };

  const toggleYearSelection = (year: number) => {
    setFormData(prev => {
      const current = prev.target_years ?? [];
      const exists = current.includes(year);
      const next = exists ? current.filter(y => y !== year) : [...current, year];
      next.sort((a, b) => a - b);
      return { ...prev, target_years: next.length ? next : null };
    });
  };

  const isAllYears = !formData.target_years || formData.target_years.length === 0;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div className="bg-black rounded-2xl border border-gray-900 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="p-6 border-b border-gray-900 bg-black">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white">Edit Announcement</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-900 rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Title *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 bg-black border border-gray-900 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter announcement title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Description *</label>
            <textarea
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 bg-black border border-gray-900 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter announcement description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Category *</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-2 bg-black border border-gray-900 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Visible to Intake Years</label>
            <p className="text-xs text-gray-500 mb-2">Restrict announcement visibility by intake year.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, target_years: null }))}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  isAllYears
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/40'
                    : 'bg-blue-900/40 text-blue-200 hover:bg-blue-800/40'
                }`}
              >
                All years
              </button>
              {INTAKE_YEAR_OPTIONS.map((intakeYear) => {
                const isSelected = formData.target_years?.includes(intakeYear);
                return (
                  <button
                    key={intakeYear}
                    type="button"
                    onClick={() => toggleYearSelection(intakeYear)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                      isSelected
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40'
                        : 'bg-purple-900/40 text-purple-200 hover:bg-purple-800/40'
                    }`}
                  >
                    {intakeYear}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {isAllYears
                ? 'Visible to all students.'
                : `Currently visible to Intake ${formData.target_years?.join(', ')}`}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Expiry Date</label>
              <input
                type="datetime-local"
                value={formData.expiry_date || ''}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                className="w-full px-4 py-2 bg-black border border-gray-900 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {isSuperAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Scheduled At</label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_at || ''}
                  onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-900 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Reminder Time</label>
              <input
                type="datetime-local"
                value={formData.reminder_time || ''}
                onChange={(e) => setFormData({ ...formData, reminder_time: e.target.value })}
                className="w-full px-4 py-2 bg-black border border-gray-900 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={formData.is_active ?? true}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded"
              />
              Active
            </label>
            {isSuperAdmin ? (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                <select
                  value={formData.status || 'active'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="px-4 py-2 bg-black border border-gray-900 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="urgent">Urgent</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
            ) : (
              <div className="flex-1 min-w-[200px] px-4 py-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-blue-200">
                Updates will be sent back to the superadmin review queue. Once approved, scheduling and activation will be handled by the superadmin.
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating...
                </span>
              ) : (
                'Update Announcement'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-gray-900 text-gray-300 hover:bg-gray-900"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditAnnouncementModal;
