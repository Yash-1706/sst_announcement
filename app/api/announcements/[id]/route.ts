import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, generalLimiterOptions, adminLimiterOptions } from '@/lib/middleware/rateLimit';
import { fetchAnnouncementById, mapAnnouncement } from '@/lib/data/announcements';
import { requireAuth, requireAdmin } from '@/lib/middleware/auth';
import { requireAllowedDomain } from '@/lib/middleware/domain';
import { BadRequestError, NotFoundError } from '@/lib/utils/errors';
import { getDb } from '@/lib/config/db';
import { announcements } from '@/lib/schema';
import { eq } from 'drizzle-orm';

function parseId(id: string): number {
  if (!id) {
    throw new BadRequestError('Announcement ID is required');
  }
  const parsed = Number(id);
  if (Number.isNaN(parsed)) {
    throw new BadRequestError('Announcement ID must be a valid number');
  }
  return parsed;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await applyRateLimit(request, generalLimiterOptions);
    const { id: idParam } = await params;
    const id = parseId(idParam);
    const announcement = await fetchAnnouncementById(id);
    if (!announcement) {
      throw new NotFoundError('Announcement', id);
    }

    return NextResponse.json({ success: true, data: announcement });

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await applyRateLimit(request, adminLimiterOptions);
    const user = await requireAuth(request, { enforceDomain: true });
    requireAllowedDomain(user);
    requireAdmin(user);

    const { id: idParam } = await params;
    const id = parseId(idParam);
    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    const allowedFields: Record<string, string> = {
      title: 'title',
      description: 'description',
      category: 'category',
      expiry_date: 'expiryDate',
      scheduled_at: 'scheduledAt',
      reminder_time: 'reminderTime',
      is_active: 'isActive',
      status: 'status',
      priority_until: 'priorityUntil',
      target_years: 'targetYears',
    };

    for (const [key, dbField] of Object.entries(allowedFields)) {
      if (body[key] !== undefined) {
        if (key === 'target_years') {
          updateData[dbField] = normalizeTargetYears(body[key]);
        } else if (key.endsWith('_date') || key.endsWith('_at') || key.endsWith('_time')) {
          updateData[dbField] = body[key] ? new Date(body[key]) : null;
        } else {
          updateData[dbField] = body[key];
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError('No fields to update');
    }

    updateData.updatedAt = new Date();
    const db = getDb();
    const result = await db
      .update(announcements)
      .set(updateData)
      .where(eq(announcements.id, id))
      .returning();

    if (result.length === 0) {
      throw new NotFoundError('Announcement', id);
    }

    return NextResponse.json({ success: true, data: mapAnnouncement(result[0]) });

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
        .filter((year) => Number.isInteger(year) && year >= 1 && year <= 6)
    )
  ).sort((a, b) => a - b);

  return normalized.length > 0 ? normalized : null;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await applyRateLimit(request, adminLimiterOptions);
    const user = await requireAuth(request, { enforceDomain: true });
    requireAllowedDomain(user);
    requireAdmin(user);

    const { id: idParam } = await params;
    const id = parseId(idParam);
    const db = getDb();
    const result = await db
      .delete(announcements)
      .where(eq(announcements.id, id))
      .returning({ id: announcements.id });

    if (result.length === 0) {
      throw new NotFoundError('Announcement', id);
    }

    return NextResponse.json({ 
      success: true, 
      data: { message: `Announcement with id ${id} deleted` } 
    });

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

