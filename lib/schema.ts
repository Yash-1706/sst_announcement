import { pgTable, serial, text, varchar, boolean, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', ['student', 'student_admin', 'admin', 'super_admin', 'user']);
export const eventTypeEnum = pgEnum('event_type', ['view', 'click', 'dismiss']);

// Enum for announcement status
export const announcementStatusEnum = pgEnum('announcement_status', [
  'scheduled',
  'active',
  'urgent',
  'expired'
]);

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull().unique(),
  username: varchar('username', { length: 100 }),
  role: userRoleEnum('role').default('student').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  lastLogin: timestamp('last_login', { withTimezone: true }),
});

export const announcements = pgTable('announcements', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  expiryDate: timestamp('expiry_date', { withTimezone: true }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  reminderTime: timestamp('reminder_time', { withTimezone: true }),
  isActive: boolean('is_active').default(true),
  status: announcementStatusEnum('status').default('active').notNull(),
  viewsCount: integer('views_count').default(0),
  clicksCount: integer('clicks_count').default(0),
  sendEmail: boolean('send_email').default(false).notNull(),
  emailSent: boolean('email_sent').default(false).notNull(),
  sendTV: boolean('send_tv').default(false).notNull(),
  priorityUntil: timestamp('priority_until', { withTimezone: true }),
  isEmergency: boolean('is_emergency').default(false).notNull(),
  emergencyExpiresAt: timestamp('emergency_expires_at', { withTimezone: true }),
  visibleAfter: timestamp('visible_after', { withTimezone: true }),
  priorityLevel: integer('priority_level').default(3).notNull(), // P0=0, P1=1, P2=2, P3=3
  targetYears: integer('target_years').array(),
});

export const announcementEngagements = pgTable('announcement_engagements', {
  id: serial('id').primaryKey(),
  announcementId: integer('announcement_id').notNull().references(() => announcements.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Relations (optional, for easier joins)
export const usersRelations = relations(users, ({ many }) => ({
  announcements: many(announcements),
  engagements: many(announcementEngagements),
}));

export const announcementsRelations = relations(announcements, ({ one, many }) => ({
  author: one(users, {
    fields: [announcements.authorId],
    references: [users.id],
  }),
  engagements: many(announcementEngagements),
}));

export const announcementEngagementsRelations = relations(announcementEngagements, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcementEngagements.announcementId],
    references: [announcements.id],
  }),
  user: one(users, {
    fields: [announcementEngagements.userId],
    references: [users.id],
  }),
}));

// Type exports for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
export type AnnouncementEngagement = typeof announcementEngagements.$inferSelect;
export type NewAnnouncementEngagement = typeof announcementEngagements.$inferInsert;
