import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, generalLimiterOptions, adminLimiterOptions } from '@/lib/middleware/rateLimit';
import { fetchAllAnnouncements, mapAnnouncement } from '@/lib/data/announcements';
import { requireAuth, requireAdmin, getUserFromRequest } from '@/lib/middleware/auth';
import { requireAllowedDomain } from '@/lib/middleware/domain';
import { validateAnnouncement } from '@/lib/utils/validation';
import { BadRequestError, formatErrorResponse } from '@/lib/utils/errors';
import { getDb, getPool } from '@/lib/config/db';
import { announcements, users } from '@/lib/schema';
import { sendAnnouncementEmail } from '@/lib/services/email';
import { eq, sql } from 'drizzle-orm';
import { normalizeUserRole, hasAdminAccess } from '@/lib/utils/roleUtils';
import { getAnnouncementPriority } from '@/utils/announcementUtils';
import type { UserRole } from '@/utils/announcementUtils';
import { getYearMetadataFromEmail, extractIntakeCodeFromEmail } from '@/utils/studentYear';

export async function GET(request: NextRequest) {
  try {
    await applyRateLimit(request, generalLimiterOptions);
    
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined;
    
    const validLimit = limit && limit > 0 && limit <= 100 ? limit : undefined;
    const validOffset = offset && offset >= 0 ? offset : undefined;
    
    const data = await fetchAllAnnouncements({ 
      limit: validLimit, 
      offset: validOffset 
    });
    const currentUser = await getUserFromRequest(request);
    const normalizedRole = normalizeUserRole(currentUser?.role, currentUser?.is_admin);
    const canViewAll = hasAdminAccess(normalizedRole) || normalizedRole === 'super_admin';
    const userIntakeCode = currentUser ? extractIntakeCodeFromEmail(currentUser.email) : null;

    const filteredData = canViewAll
      ? data
      : data.filter(announcement => {
          const targets = Array.isArray(announcement.target_years) ? announcement.target_years : null;
          if (!targets || targets.length === 0) {
            return true;
          }
          if (!userIntakeCode) {
            return false;
          }
          return targets.includes(userIntakeCode); // Match by intake code (23, 24, 25, etc.)
        });

    return NextResponse.json({ success: true, data: filteredData });

  } catch (error: any) {
    console.error('[GET] /api/announcements error:', error);
    const status = error?.statusCode || error?.status || 500;
    return NextResponse.json(formatErrorResponse(error), { status });
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
      priority_level = 3, // Default to P3
      is_active = true,
      status = 'active',
      send_email = false,
      send_tv = false,
      target_years = null,
    } = body;

    const db = getDb();
    const prioritySupported = await ensurePriorityColumn(db);
    const targetYearsSupported = await ensureTargetYearsColumn(db);
    const now = new Date();
    const scheduledDateRaw = scheduled_at ? new Date(scheduled_at) : null;
    const priorityUntilRaw = priority_until ? new Date(priority_until) : null;
    const scheduledDate = scheduledDateRaw && !isNaN(scheduledDateRaw.getTime()) ? scheduledDateRaw : null;
    const priorityUntilDate = priorityUntilRaw && !isNaN(priorityUntilRaw.getTime()) ? priorityUntilRaw : null;
    const hasPriorityWindow = priorityUntilDate ? priorityUntilDate > now : false;
    
    // Validate priority_level (0-3, where 0=P0, 1=P1, 2=P2, 3=P3)
    const validPriorityLevel = Math.max(0, Math.min(3, priority_level ?? 3));
    const userRole = normalizeUserRole(user.role, user.is_admin);

    let resolvedScheduledDate = scheduledDate;
    let autoRescheduled = false;
    let pendingScheduleAdjustments: ScheduleAdjustment[] = [];

    // Automatically resolve schedule conflicts by finding the next available slot
    if (scheduledDate) {
      if (userRole === 'super_admin') {
        const reflowResult = await reflowSchedulesForSuperAdmin(scheduledDate, validPriorityLevel, userRole);
        resolvedScheduledDate = reflowResult.scheduledAt;
        autoRescheduled = reflowResult.autoAdjusted;
        pendingScheduleAdjustments = reflowResult.adjustments;
      } else {
        const scheduleResult = await findNextAvailableScheduleSlot(scheduledDate);
        resolvedScheduledDate = scheduleResult.scheduledAt;
        autoRescheduled = scheduleResult.autoAdjusted;
      }
    }

    const isScheduled = resolvedScheduledDate ? resolvedScheduledDate > now : false;
    
    // Use 'urgent' for emergency announcements, but fallback to 'active' if enum doesn't support it
    const finalStatus = hasPriorityWindow ? 'urgent' : isScheduled ? 'scheduled' : status;
    const finalIsActive = isScheduled ? false : hasPriorityWindow ? true : is_active;
    
    const normalizedTargetYears = normalizeTargetYears(target_years);

    const announcementValues: any = {
      title,
      description,
      category,
      authorId: user.id,
      expiryDate: expiry_date ? new Date(expiry_date) : null,
      scheduledAt: resolvedScheduledDate ? new Date(resolvedScheduledDate) : null,
      reminderTime: reminder_time ? new Date(reminder_time) : null,
      isActive: finalIsActive,
      status: finalStatus,
      sendEmail: send_email,
      emailSent: false,
      sendTV: send_tv,
      priorityLevel: validPriorityLevel,
    };
    if (prioritySupported) {
      announcementValues.priorityUntil = priorityUntilDate;
    }
    if (targetYearsSupported) {
      announcementValues.targetYears = normalizedTargetYears;
    }

    const record = await insertAnnouncementWithFallback(db, announcementValues, {
      prioritySupported,
      targetYearsSupported,
    });

    if (pendingScheduleAdjustments.length > 0) {
      await applyScheduleAdjustments(db, pendingScheduleAdjustments);
    }

    let emailSent = false;
    let emailMessage: string | null = null;

    if (send_email && !isScheduled) {
      try {
        const emails = await resolveRecipientEmails(normalizedTargetYears);
        if (emails.length > 0) {
          const result = await sendAnnouncementEmail({
            title,
            description,
            category,
            recipientEmails: emails,
            expiryDate: expiry_date || null,
            scheduledAt: resolvedScheduledDate?.toISOString() || null,
          });
          emailSent = result.success;
          emailMessage = result.message || result.error || null;
          if (result.success) {
            await db
              .update(announcements)
              .set({ emailSent: true })
              .where(eq(announcements.id, record.id!));
          }
        } else {
          emailMessage = 'No recipients matched the selected years';
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
        autoRescheduled: autoRescheduled
          ? {
              original: scheduled_at,
              scheduled_for: resolvedScheduledDate?.toISOString() || null,
            }
          : null,
      },
    }, { status: 201 });

  } catch (error: any) {
    console.error('[POST] /api/announcements error:', error);
    const status = error?.statusCode || error?.status || 500;
    return NextResponse.json(formatErrorResponse(error), { status });
  }
}

function normalizeTargetYears(value: unknown): number[] | null {
  if (!value) {
    return null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const normalized = Array.from(
    new Set(
      value
        .map((entry) => {
          if (typeof entry === 'string') {
            const parsed = parseInt(entry, 10);
            return Number.isNaN(parsed) ? null : parsed;
          }
          return typeof entry === 'number' ? entry : null;
        })
        .filter((entry): entry is number => entry !== null)
        .filter((year) => Number.isInteger(year) && year >= 1 && year <= 99) // Intake year codes (23, 24, 25, etc.)
    )
  ).sort((a, b) => a - b);

  return normalized.length > 0 ? normalized : null;
}

const SLOT_INTERVAL_MINUTES = 5;

type ScheduleResolutionResult = {
  scheduledAt: Date;
  autoAdjusted: boolean;
};

type ScheduleAdjustment = {
  id: number;
  newTime: Date;
};

type DetailedConflictRecord = {
  id: number;
  title: string | null;
  scheduled_at: string | null;
  priority_level: number | null;
  author_role: string | null;
};

async function findNextAvailableScheduleSlot(
  desiredDate: Date
): Promise<ScheduleResolutionResult> {
  const maxIterations = 180; // Search up to 3 hours ahead (minute granularity)
  const normalizedDesired = new Date(desiredDate);
  normalizedDesired.setSeconds(0, 0);
  let candidate = new Date(normalizedDesired);

  for (let i = 0; i < maxIterations; i++) {
    const minuteStart = new Date(candidate);
    const minuteEnd = new Date(minuteStart);
    minuteEnd.setMinutes(minuteEnd.getMinutes() + SLOT_INTERVAL_MINUTES);

    const conflicts = await fetchConflictsForRange(minuteStart, minuteEnd);

    if (!conflicts.length) {
      return {
        scheduledAt: minuteStart,
        autoAdjusted: minuteStart.getTime() !== normalizedDesired.getTime(),
      };
    }

    candidate = minuteEnd;
  }

  throw new BadRequestError(
    'Unable to automatically find an available time slot within the next 3 hours. Please choose a different scheduled time.'
  );
}

async function reflowSchedulesForSuperAdmin(
  desiredDate: Date,
  newAnnouncementPriority: number,
  userRole: UserRole
): Promise<ScheduleResolutionResult & { adjustments: ScheduleAdjustment[] }> {
  const normalizedDesired = new Date(desiredDate);
  normalizedDesired.setSeconds(0, 0);

  const windowEnd = new Date(normalizedDesired);
  windowEnd.setMinutes(windowEnd.getMinutes() + SLOT_INTERVAL_MINUTES);

  const conflicts = await fetchConflictsForRange(normalizedDesired, windowEnd);

  if (conflicts.length === 0) {
    return {
      scheduledAt: normalizedDesired,
      autoAdjusted: normalizedDesired.getTime() !== desiredDate.setSeconds(0, 0),
      adjustments: [],
    };
  }

  const rolePriority = getAnnouncementPriority(userRole);
  const records = [
    ...conflicts.map(conflict => ({
      id: conflict.id,
      priorityLevel: conflict.priority_level ?? 3,
      rolePriority: getAnnouncementPriority(
        normalizeUserRole(conflict.author_role ?? undefined, undefined)
      ),
      scheduledAt: conflict.scheduled_at ? new Date(conflict.scheduled_at) : null,
    })),
    {
      id: null,
      priorityLevel: newAnnouncementPriority,
      rolePriority,
      scheduledAt: normalizedDesired,
    },
  ];

  records.sort((a, b) => {
    if (a.priorityLevel !== b.priorityLevel) {
      return a.priorityLevel - b.priorityLevel;
    }
    return b.rolePriority - a.rolePriority;
  });

  const adjustments: ScheduleAdjustment[] = [];
  let cursor = new Date(normalizedDesired);
  cursor.setSeconds(0, 0);
  let assignedNewAnnouncementTime = new Date(cursor);

  for (const record of records) {
    if (record.id === null) {
      assignedNewAnnouncementTime = new Date(cursor);
    } else {
      if (!record.scheduledAt || record.scheduledAt.getTime() !== cursor.getTime()) {
        adjustments.push({ id: record.id, newTime: new Date(cursor) });
      }
    }

    cursor = new Date(cursor);
    cursor.setMinutes(cursor.getMinutes() + SLOT_INTERVAL_MINUTES);
  }

  const autoAdjusted =
    assignedNewAnnouncementTime.getTime() !== normalizedDesired.getTime() || adjustments.length > 0;

  return {
    scheduledAt: assignedNewAnnouncementTime,
    autoAdjusted,
    adjustments,
  };
}

async function fetchConflictsForRange(start: Date, end: Date): Promise<DetailedConflictRecord[]> {
  const pool = getPool();
  const result = await pool.query({
    text: `
      SELECT a.id, a.title, a.priority_level, a.scheduled_at, u.role AS author_role
      FROM announcements a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.scheduled_at IS NOT NULL
        AND a.scheduled_at >= $1
        AND a.scheduled_at < $2
        AND a.status IN ('scheduled', 'under_review', 'active')
    `,
    values: [start.toISOString(), end.toISOString()],
  });

  return result.rows || [];
}

async function applyScheduleAdjustments(
  db: ReturnType<typeof getDb>,
  adjustments: ScheduleAdjustment[]
) {
  for (const adjustment of adjustments) {
    await db
      .update(announcements)
      .set({
        scheduledAt: adjustment.newTime,
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, adjustment.id));
  }
}

// Helper functions (same as original)
type PriorityColumnState = 'unknown' | 'supported' | 'unsupported';
let priorityColumnState: PriorityColumnState = 'unknown';
let urgentStatusEnsured = false;
let initializationPromise: Promise<void> | null = null;
type TargetYearsColumnState = 'unknown' | 'supported' | 'unsupported';
let targetYearsColumnState: TargetYearsColumnState = 'unknown';

async function initializeSchema(): Promise<void> {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const db = getDb();
    await Promise.all([
      ensurePriorityColumn(db),
      ensureTargetYearsColumn(db),
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

async function ensureTargetYearsColumn(db: ReturnType<typeof getDb>): Promise<boolean> {
  if (targetYearsColumnState === 'supported') return true;
  if (targetYearsColumnState === 'unsupported') return false;

  try {
    const checkResult: any = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'announcements' AND column_name = 'target_years'
      LIMIT 1
    `);

    if (checkResult?.rows?.length > 0) {
      targetYearsColumnState = 'supported';
      return true;
    }

    await db.execute(sql`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_years INTEGER[]`);

    const verifyResult: any = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'announcements' AND column_name = 'target_years'
      LIMIT 1
    `);

    if (verifyResult?.rows?.length > 0) {
      targetYearsColumnState = 'supported';
      return true;
    }

    targetYearsColumnState = 'unsupported';
    return false;
  } catch (error) {
    console.warn('Unable to add/check target_years column; continuing without audience filtering', error);
    targetYearsColumnState = 'unsupported';
    return false;
  }
}

async function insertAnnouncementWithFallback(
  db: ReturnType<typeof getDb>,
  values: typeof announcements.$inferInsert,
  options: { prioritySupported: boolean; targetYearsSupported: boolean }
) {
  const { prioritySupported, targetYearsSupported } = options;

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
  const targetYearsValue =
    targetYearsSupported && Array.isArray(values.targetYears) && values.targetYears.length > 0
      ? values.targetYears
      : null;

  // Use 'active' instead of 'urgent' if enum doesn't support it
  const insertStatus = values.status === 'urgent' ? 'active' : (values.status ?? 'active');
  const priorityLevel = values.priorityLevel ?? 3;
  
  try {
    const manualInsert = await pool.query({
      text: buildManualInsertStatement(!!targetYearsValue),
      values: buildManualInsertValues({
        values,
        insertStatus,
        priorityLevel,
        targetYearsValue,
      }),
    });
    
    if (!manualInsert.rows?.length) {
      throw new Error('Failed to insert announcement without priority column');
    }
    
    return mapRowToAnnouncement(manualInsert.rows[0]);
  } catch (error) {
    if (isInvalidEnumError(error) && insertStatus !== 'active') {
      const manualInsert = await pool.query({
        text: buildManualInsertStatement(!!targetYearsValue),
        values: buildManualInsertValues({
          values,
          insertStatus: 'active',
          priorityLevel,
          targetYearsValue,
        }),
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

function buildManualInsertStatement(includeTargetYears: boolean): string {
  const columns = [
    'title',
    'description',
    'category',
    'author_id',
    'expiry_date',
    'scheduled_at',
    'reminder_time',
    'is_active',
    'status',
    'send_email',
    'email_sent',
    'send_tv',
    'priority_level',
  ];
  if (includeTargetYears) {
    columns.push('target_years');
  }
  const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
  return `
        INSERT INTO announcements (${columns.join(', ')})
        VALUES (${placeholders})
        RETURNING *
      `;
}

function buildManualInsertValues({
  values,
  insertStatus,
  priorityLevel,
  targetYearsValue,
}: {
  values: typeof announcements.$inferInsert;
  insertStatus: string;
  priorityLevel: number;
  targetYearsValue: number[] | null;
}) {
  const params: any[] = [
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
    priorityLevel,
  ];
  if (targetYearsValue) {
    params.push(targetYearsValue);
  }
  return params;
}

async function resolveRecipientEmails(targetYears: number[] | null): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ email: users.email }).from(users);
  const normalizedTargets = Array.isArray(targetYears) && targetYears.length > 0 ? targetYears : null;

  return rows
    .map((row) => row.email)
    .filter((email): email is string => Boolean(email))
    .filter((email) => {
      if (!normalizedTargets) {
        return true;
      }
      const intakeCode = extractIntakeCodeFromEmail(email);
      if (!intakeCode) {
        return false;
      }
      return normalizedTargets.includes(intakeCode);
    });
}

function mapRowToAnnouncement(row: any): typeof announcements.$inferSelect {
  const targetYears =
    Array.isArray(row.target_years) && row.target_years.length > 0 ? row.target_years : null;
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
    priorityUntil: null,
    priorityLevel: row.priority_level ?? 3,
    targetYears,
  } as typeof announcements.$inferSelect;
}
