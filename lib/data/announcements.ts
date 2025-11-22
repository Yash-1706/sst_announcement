import { desc, eq } from 'drizzle-orm';
import { getDb } from '../config/db';
import { announcements } from '../schema';

export type AnnouncementRecord = typeof announcements.$inferSelect;

export function mapAnnouncement(record: AnnouncementRecord) {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    category: record.category,
    author_id: record.authorId,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    expiry_date: record.expiryDate,
    scheduled_at: record.scheduledAt,
    reminder_time: record.reminderTime,
    is_active: record.isActive,
    status: record.status,
    views_count: record.viewsCount,
    clicks_count: record.clicksCount,
    send_email: record.sendEmail,
    email_sent: record.emailSent,
    send_tv: record.sendTV,
    priority_until: record.priorityUntil,
  };
}

export function mapAnnouncements(records: AnnouncementRecord[]) {
  return records.map(mapAnnouncement);
}

export async function fetchAllAnnouncements(options?: { limit?: number; offset?: number }) {
  const db = getDb();
  let query = db.select().from(announcements).orderBy(desc(announcements.createdAt));
  
  if (options?.limit !== undefined) {
    query = query.limit(options.limit) as any;
  }
  if (options?.offset !== undefined) {
    query = query.offset(options.offset) as any;
  }
  
  const rows = await query;
  return mapAnnouncements(rows);
}

export async function fetchAnnouncementById(id: number) {
  const db = getDb();
  const rows = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
  return rows.length > 0 ? mapAnnouncement(rows[0]) : null;
}

export async function getTvData() {
  const db = getDb();
  const rows = await db
    .select()
    .from(announcements)
    .where(eq(announcements.sendTV, true))
    .orderBy(desc(announcements.createdAt))
    .limit(5);

  return rows.map(mapAnnouncement);
}