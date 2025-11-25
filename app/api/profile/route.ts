import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { applyRateLimit, generalLimiterOptions } from '@/lib/middleware/rateLimit';
import { normalizeUserRole, hasAdminAccess } from '@/lib/utils/roleUtils';
import { getYearMetadataFromEmail } from '@/utils/studentYear';

export async function GET(request: NextRequest) {
  try {
    await applyRateLimit(request, generalLimiterOptions);

    const user = await requireAuth(request, { enforceDomain: true });
    const role = normalizeUserRole(user.role, user.is_admin);
    const yearMetadata = getYearMetadataFromEmail(user.email);

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role,
        google_id: user.google_id,
        username: user.username,
        is_admin: user.is_admin ?? hasAdminAccess(role),
        created_at: user.created_at,
        last_login: user.last_login,
        intake_year: user.intake_year ?? yearMetadata?.intakeYear ?? null,
        year_level: user.year_level ?? yearMetadata?.yearLevel ?? null,
      },
    });

  } catch (error: any) {
    console.error('❌ Profile error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Authentication required',
      },
      { status: error.status || 401 }
    );
  }
}
