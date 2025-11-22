import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, generalLimiterOptions, adminLimiterOptions } from '@/lib/middleware/rateLimit';
import { fetchAllAnnouncements, mapAnnouncement } from '@/lib/data/announcements';
import { requireAuth, requireAdmin } from '@/lib/middleware/auth';
import { requireAllowedDomain } from '@/lib/middleware/domain';
import { validateAnnouncement } from '@/lib/utils/validation';
import { BadRequestError } from '@/lib/utils/errors';
import { getDb, getPool } from '@/lib/config/db';
import { announcements } from '@/lib/schema';
import { getAllUsers } from '@/lib/data/users';
import { sendAnnouncementEmail } from '@/lib/services/email';
import { eq, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    await applyRateLimit(request, generalLimiterOptions);
    
    // Parse pagination params
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined;
    
    // Validate pagination
    const validLimit = limit && limit > 0 && limit <= 100 ? limit : undefined;
    const validOffset = offset && offset >= 0 ? offset : undefined;
    
    const data = await fetchAllAnnouncements({ 
      limit: validLimit, 
      offset: validOffset 
    });

    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: error.status || 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await applyRateLimit(request, adminLimiterOptions);
    const user = await requireAuth(request, { enforceDomain: true });
    requireAllowedDomain(user);
    requireAdmin(user);

    // Initialize schema once (cached after first call)
    await initializeSchema();

    const body = await request.json();
    const validationErrors = validateAnnouncement(body);
    if (validationErrors.length > 0) {
      throw new BadRequestError('Validation failed', validationErrors);
    }

    const {
      title,
      description,
      category,
      expiry_date,
      scheduled_at,
      reminder_time,
      priority_until,
      is_active = true,
      status = 'active',
      send_email = false,
      send_tv = false,
    } = body;

    const db = getDb();
    const prioritySupported = await ensurePriorityColumn(db);
    const now = new Date();
    const scheduledDateRaw = scheduled_at ? new Date(scheduled_at) : null;
    const priorityUntilRaw = priority_until ? new Date(priority_until) : null;
    const scheduledDate = scheduledDateRaw && !isNaN(scheduledDateRaw.getTime()) ? scheduledDateRaw : null;
    const priorityUntilDate = priorityUntilRaw && !isNaN(priorityUntilRaw.getTime()) ? priorityUntilRaw : null;
    const isScheduled = scheduledDate ? scheduledDate > now : false;
    const hasPriorityWindow = priorityUntilDate ? priorityUntilDate > now : false;
    
    // Use 'urgent' for emergency announcements, but fallback to 'active' if enum doesn't support it
    const finalStatus = hasPriorityWindow ? 'urgent' : isScheduled ? 'scheduled' : status;
    const finalIsActive = isScheduled ? false : hasPriorityWindow ? true : is_active;

    const announcementValues: any = {
      title,
      description,
      category,
      authorId: user.id,
      expiryDate: expiry_date ? new Date(expiry_date) : null,
      scheduledAt: scheduled_at ? new Date(scheduled_at) : null,
      reminderTime: reminder_time ? new Date(reminder_time) : null,
      isActive: finalIsActive,
      status: finalStatus,
      sendEmail: send_email,
      emailSent: false,
      sendTV: send_tv,
    };
    if (prioritySupported) {
      announcementValues.priorityUntil = priorityUntilDate;
    }

    const record = await insertAnnouncementWithFallback(db, announcementValues, prioritySupported);

    let emailSent = false;
    let emailMessage: string | null = null;

    if (send_email && !isScheduled) {
      try {
        // Hardcoded email recipient
        const emails = ['mohammed.24bcs10278@sst.scaler.com'];
        if (emails.length > 0) {
          const result = await sendAnnouncementEmail({
            title,
            description,
            category,
            recipientEmails: emails,
            expiryDate: expiry_date || null,
            scheduledAt: scheduled_at || null,
          });
          emailSent = result.success;
          emailMessage = result.message || result.error || null;
          if (result.success) {
            await db
              .update(announcements)
              .set({ emailSent: true })
              .where(eq(announcements.id, record.id!));
          }
        }
      } catch (error) {
        console.error('Error sending announcement email:', error);
        emailMessage = error instanceof Error ? error.message : 'Failed to send email';
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        announcement: mapAnnouncement(record),
        emailSent,
        emailMessage,
      },
    }, { status: 201 });

  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: error.status || 500 }
    );
  }
}

// Helper functions (same as original)
type PriorityColumnState = 'unknown' | 'supported' | 'unsupported';
let priorityColumnState: PriorityColumnState = 'unknown';
let urgentStatusEnsured = false;
let initializationPromise: Promise<void> | null = null;

async function initializeSchema(): Promise<void> {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const db = getDb();
    await Promise.all([
      ensurePriorityColumn(db),
      ensureUrgentStatusEnum(db)
    ]);
  })();

  return initializationPromise;
}

async function ensurePriorityColumn(db: ReturnType<typeof getDb>): Promise<boolean> {
  if (priorityColumnState === 'supported') return true;
  if (priorityColumnState === 'unsupported') return false;

  try {
    // Check if column exists
    const checkResult: any = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'announcements' AND column_name = 'priority_until'
      LIMIT 1
    `);
    
    if (checkResult?.rows?.length > 0) {
      priorityColumnState = 'supported';
      return true;
    }

    // Column doesn't exist, try to add it
    await db.execute(sql`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS priority_until TIMESTAMPTZ`);
    
    // Verify it was added
    const verifyResult: any = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'announcements' AND column_name = 'priority_until'
      LIMIT 1
    `);
    
    if (verifyResult?.rows?.length > 0) {
      priorityColumnState = 'supported';
      return true;
    }
    
    // Column still doesn't exist after trying to add it
    priorityColumnState = 'unsupported';
    return false;
  } catch (error) {
    console.warn('Unable to add/check priority_until column; falling back without priority support', error);
    priorityColumnState = 'unsupported';
    return false;
  }
}

async function ensureUrgentStatusEnum(db: ReturnType<typeof getDb>): Promise<void> {
  if (urgentStatusEnsured) return;

  try {
    // Check if announcement_status enum exists
    const enumCheck: any = await db.execute(sql`
      SELECT 1 FROM pg_type WHERE typname = 'announcement_status' LIMIT 1
    `);
    
    if (enumCheck?.rows?.length > 0) {
      // Enum exists, check if 'urgent' is already in it
      const urgentCheck: any = await db.execute(sql`
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'urgent' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'announcement_status')
        LIMIT 1
      `);
      
      if (!urgentCheck?.rows?.length) {
        // Add 'urgent' to the enum (PostgreSQL doesn't support IF NOT EXISTS for enums)
        try {
          await db.execute(sql`ALTER TYPE announcement_status ADD VALUE 'urgent'`);
        } catch (addError: any) {
          // If it already exists or fails, that's okay
          const errorMsg = addError?.message || String(addError);
          if (!errorMsg.includes('already exists')) {
            console.warn('Could not add urgent to enum:', errorMsg);
          }
        }
      }
    }
    // If enum doesn't exist, status is varchar and 'urgent' will work fine
    urgentStatusEnsured = true;
  } catch (error) {
    // If we can't check/add to enum, status is probably varchar anyway, so 'urgent' should work
    console.warn('Could not ensure urgent status in enum (may not be needed)', error);
    urgentStatusEnsured = true; // Mark as done to avoid retrying
  }
}

async function insertAnnouncementWithFallback(
  db: ReturnType<typeof getDb>,
  values: typeof announcements.$inferInsert,
  prioritySupported: boolean
) {
  if (prioritySupported) {
    try {
      const [record] = await db.insert(announcements).values(values).returning();
      return record;
    } catch (error) {
      // If insert fails with priority column, retry without it
      if (isMissingPriorityColumnError(error)) {
        priorityColumnState = 'unsupported';
        // Fall through to manual insert below
      } else if (isInvalidEnumError(error) && values.status === 'urgent') {
        // If 'urgent' status is not supported by enum, fallback to 'active'
        console.warn('Urgent status not supported, using active instead');
        const fallbackValues = { ...values, status: 'active' as const };
        const [record] = await db.insert(announcements).values(fallbackValues).returning();
        return record;
      } else {
        throw error;
      }
    }
  }

  // Priority column not available - use manual insert without that column
  const pool = getPool();
  
  // Use 'active' instead of 'urgent' if enum doesn't support it
  const insertStatus = values.status === 'urgent' ? 'active' : (values.status ?? 'active');
  
  try {
    const manualInsert = await pool.query({
      text: `
        INSERT INTO announcements (
          title,
          description,
          category,
          author_id,
          expiry_date,
          scheduled_at,
          reminder_time,
          is_active,
          status,
          send_email,
          email_sent,
          send_tv
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `,
      values: [
        values.title,
        values.description,
        values.category,
        values.authorId,
        values.expiryDate ?? null,
        values.scheduledAt ?? null,
        values.reminderTime ?? null,
        values.isActive ?? true,
        insertStatus,
        values.sendEmail ?? false,
        values.emailSent ?? false,
        values.sendTV ?? false,
      ],
    });
    
    if (!manualInsert.rows?.length) {
      throw new Error('Failed to insert announcement without priority column');
    }
    
    // Map snake_case to camelCase to match Drizzle schema format
    return mapRowToAnnouncement(manualInsert.rows[0]);
  } catch (error) {
    // If still fails with enum error, try with 'active' status
    if (isInvalidEnumError(error) && insertStatus !== 'active') {
      const manualInsert = await pool.query({
        text: `
          INSERT INTO announcements (
            title,
            description,
            category,
            author_id,
            expiry_date,
            scheduled_at,
            reminder_time,
            is_active,
            status,
            send_email,
            email_sent,
            send_tv
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *
        `,
        values: [
          values.title,
          values.description,
          values.category,
          values.authorId,
          values.expiryDate ?? null,
          values.scheduledAt ?? null,
          values.reminderTime ?? null,
          values.isActive ?? true,
          'active',
          values.sendEmail ?? false,
          values.emailSent ?? false,
          values.sendTV ?? false,
        ],
      });
      
      if (!manualInsert.rows?.length) {
        throw new Error('Failed to insert announcement');
      }
      
      return mapRowToAnnouncement(manualInsert.rows[0]);
    }
    throw error;
  }
}

function isMissingPriorityColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('priority_until') ||
    lowerMessage.includes('priority until') ||
    (lowerMessage.includes('column') && lowerMessage.includes('does not exist'))
  );
}

function isInvalidEnumError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('invalid input value for enum') ||
    lowerMessage.includes('invalid enum value')
  );
}

function mapRowToAnnouncement(row: any): typeof announcements.$inferSelect {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    authorId: row.author_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiryDate: row.expiry_date,
    scheduledAt: row.scheduled_at,
    reminderTime: row.reminder_time,
    isActive: row.is_active,
    status: row.status,
    viewsCount: row.views_count ?? 0,
    clicksCount: row.clicks_count ?? 0,
    sendEmail: row.send_email ?? false,
    emailSent: row.email_sent ?? false,
    sendTV: row.send_tv ?? false,
    priorityUntil: null, // Not supported in manual insert fallback
  } as typeof announcements.$inferSelect;
}
